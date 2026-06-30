/**
 * ECOVACS Client V2 Wrapper
 * Uses the new Api2Factory and Api2Device from node-ecovacs.js (feature/api-2.0-base)
 *
 * API V2 provides:
 * - Clean EventEmitter pattern for devices
 * - Synchronous getters with automatic lazy-load on first access
 * - Change-detection (events fire only on actual changes)
 * - Dedup of multiple getter calls
 * - Better LZMA multipacket assembly for maps
 * - Unified state interface
 */

class EcovacsClientV2 {
	/**
	 * Constructor
	 * @param {Object} adapter - ioBroker adapter instance
	 * @param {Object} config - Adapter configuration
	 */
	constructor(adapter, config) {
		this.adapter = adapter;
		this.config = config;
		this.factory = null;
		this.devices = [];
		this.deviceMap = {};
		this.debugFlags = {
			connection: config.debugAuth === true || config.debugTopics === true,
			auth: config.debugAuth === true,
			devices: config.debugTopics === true,
		};
		this.rawMessagesEnabled = config.rawMessages === true;
		this.isConnected = false;
	}

	/**
	 * Initialize connection to ECOVACS service using API V2
	 * @returns {Promise<boolean>}
	 */
	async connect() {
		try {
			// Dynamically require API2 library
			let Api2Factory;
			try {
				//import { Api2Factory } from "./src/api2/index.js";
				const lib = require('node-ecovacs.js/src/api2/index.js');
				if (lib && lib.Api2Factory) {
					Api2Factory = lib.Api2Factory;
				} else {
					throw new Error('Api2Factory not found in node-ecovacs.js');
				}
			} catch (error) {
				this.adapter.log.error(`[Client V2] Failed to load Api2Factory: ${error.message}`);
				return false;
			}

			this.adapter.log.info('[Client V2] Initializing Api2Factory...');

			// Create factory with credentials
			this.factory = new Api2Factory({
				user: this.config.username,
				password: this.config.password,
				country: this.config.country || 'DE',
				continent: this.config.continent || 'eu',
				enableLogging: this.adapter.log.debug ? true : false,
				debugFlags: this.debugFlags,
			});

			// Connect to cloud
			this.adapter.log.info('[Client V2] Connecting to ECOVACS cloud...');
			await this.factory.connect();

			this.isConnected = true;
			this.adapter.log.info('[Client V2] Connected to ECOVACS cloud');
			return true;
		} catch (error) {
			this.adapter.log.error(`[Client V2] Connection failed: ${error.message}`);
			return false;
		}
	}

	/**
	 * Discover all GOAT devices
	 * @returns {Promise<Array<Object>>}
	 */
	async getDevices() {
		try {
			if (!this.factory) {
				this.adapter.log.warn('[Client V2] Factory not initialized');
				return [];
			}

			this.adapter.log.info('[Client V2] Fetching GOAT devices...');
			const goatDevices = await this.factory.getGoatDevices();

			if (!Array.isArray(goatDevices)) {
				this.adapter.log.warn('[Client V2] getGoatDevices() returned non-array');
				return [];
			}

			this.adapter.log.info(`[Client V2] Found ${goatDevices.length} GOAT device(s)`);

			// Map to adapter-friendly format
			this.devices = goatDevices.map(device => this._mapApi2Device(device));

			return this.devices;
		} catch (error) {
			this.adapter.log.error(`[Client V2] Device discovery failed: ${error.message}`);
			return [];
		}
	}

	/**
	 * Setup realtime callbacks for a device
	 * @param {Object} device - Api2Device instance from discovery
	 * @param {string} channelKey - ioBroker channel key
	 * @param {Function} onUpdate - Callback(channelKey, update) => Promise<void>
	 * @returns {Promise<boolean>}
	 */
	async setupDeviceCallbacks(device, channelKey, onUpdate) {
		try {
			if (!device || typeof device.on !== 'function') {
				this.adapter.log.warn(`[Client V2] Invalid device for ${channelKey}`);
				return false;
			}

			this.adapter.log.info(`[Client V2] Setting up callbacks for ${channelKey} (id=${device.id})`);

			// Connect device to MQTT
			if (this.factory && typeof this.factory.connectDevice === 'function') {
				await this.factory.connectDevice(device);
				this.adapter.log.info(`[Client V2] Device ${channelKey} connected via MQTT`);
			}

			// Store for later reference
			this.deviceMap[channelKey] = device;

			// Setup all supported event handlers
			this._setupEventHandlers(device, channelKey, onUpdate);

			return true;
		} catch (error) {
			this.adapter.log.warn(`[Client V2] Callback setup failed for ${channelKey}: ${error.message}`);
			return false;
		}
	}

	/**
	 * Setup all event handlers for a device
	 * @private
	 */
	_setupEventHandlers(device, channelKey, onUpdate) {
		const self = this;

		// Core stats events
		device.on('stats', (data) => {
			onUpdate(channelKey, { stats: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on stats: ${err.message}`);
			});
		});

		device.on('lastTimeStats', (data) => {
			onUpdate(channelKey, { lastTimeStats: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on lastTimeStats: ${err.message}`);
			});
		});

		device.on('totalStats', (data) => {
			onUpdate(channelKey, { totalStats: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on totalStats: ${err.message}`);
			});
		});

		// Battery
		device.on('battery', (battery) => {
			onUpdate(channelKey, { battery }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on battery: ${err.message}`);
			});
		});

		// Charge state and info
		device.on('chargeState', (data) => {
			onUpdate(channelKey, { chargeState: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on chargeState: ${err.message}`);
			});
		});

		device.on('chargeInfo', (data) => {
			onUpdate(channelKey, { chargeInfo: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on chargeInfo: ${err.message}`);
			});
		});

		// Mow info
		device.on('mowInfo', (data) => {
			const update = { mowInfo: data };
			// Add status from mowInfo.state if available
			if (data && typeof data === 'object' && data.state) {
				update.status = String(data.state);
			}
			onUpdate(channelKey, update).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on mowInfo: ${err.message}`);
			});
		});

		// Positions (mapped to goatPosition, chargePosition, rtkPosition)
		device.on('goatPosition', (data) => {
			onUpdate(channelKey, { goatPosition: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on goatPosition: ${err.message}`);
			});
		});

		device.on('chargePosition', (data) => {
			onUpdate(channelKey, { chargePosition: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on chargePosition: ${err.message}`);
			});
		});

		device.on('rtkPosition', (data) => {
			onUpdate(channelKey, { rtkPosition: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on rtkPosition: ${err.message}`);
			});
		});

		// Life span
		device.on('lifeSpan', (data) => {
			onUpdate(channelKey, { lifeSpan: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on lifeSpan: ${err.message}`);
			});
		});

		// Network info
		device.on('netInfo', (data) => {
			onUpdate(channelKey, { netInfo: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on netInfo: ${err.message}`);
			});
		});

		// Error and sleep
		device.on('error', (data) => {
			onUpdate(channelKey, { error: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on error: ${err.message}`);
			});
		});

		device.on('sleep', (data) => {
			onUpdate(channelKey, { sleep: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on sleep: ${err.message}`);
			});
		});

		// Protect state
		device.on('protectState', (data) => {
			onUpdate(channelKey, { protectState: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on protectState: ${err.message}`);
			});
		});

		// Area and parameters
		device.on('areaSet', (data) => {
			onUpdate(channelKey, { areaSet: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on areaSet: ${err.message}`);
			});
		});

		device.on('areaParameters', (data) => {
			onUpdate(channelKey, { areaParameters: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on areaParameters: ${err.message}`);
			});
		});

		// Geolocation
		device.on('geolocation', (data) => {
			onUpdate(channelKey, { geolocation: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on geolocation: ${err.message}`);
			});
		});

		// Settings fields (all via individual events)
		const settingsFields = [
			'cutEfficiency', 'obstacleHeight', 'cutHeight', 'cutDirection',
			'autoCutDirection', 'rainDelay', 'animProtect', 'timeZone',
			'customCutMode', 'borderSwitch'
		];

		for (const fieldName of settingsFields) {
			device.on(fieldName, (data) => {
				onUpdate(channelKey, { [fieldName]: data }).catch(err => {
					self.adapter.log.debug(`[Client V2] Error on ${fieldName}: ${err.message}`);
				});
			});
		}

		// Map data (new in API V2)
		device.on('mapAr', (data) => {
			onUpdate(channelKey, { mapAr: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on mapAr: ${err.message}`);
			});
		});

		device.on('arInfo', (data) => {
			onUpdate(channelKey, { arInfo: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on arInfo: ${err.message}`);
			});
		});

		device.on('mapInfo', (data) => {
			onUpdate(channelKey, { mapInfo: data }).catch(err => {
				self.adapter.log.debug(`[Client V2] Error on mapInfo: ${err.message}`);
			});
		});

		// Unknown topic handler (debug)
		device.on('unknownTopic', ({ topicName, data }) => {
			if (this.rawMessagesEnabled) {
				self.adapter.log.debug(`[Client V2] Unknown topic: ${topicName}`);
			}
		});
	}

	/**
	 * Get initial snapshot of all available data for a device
	 * Uses synchronous getters (lazy-load triggered automatically)
	 * @param {Object} device - Api2Device
	 * @returns {Object}
	 */
	async getInitialSnapshot(device) {
		try {
			const snapshot = {};

			// Synchronous getters (these trigger lazy-load automatically)
			const gettersToCall = [
				'getStats', 'getLastTimeStats', 'getTotalStats',
				'getBattery', 'getChargeState', 'getChargeInfo',
				'getMowInfo', 'getGoatPosition', 'getChargePosition', 'getRtkPosition',
				'getLifeSpan', 'getNetInfo', 'getError', 'getSleep',
				'getProtectState', 'getAreaSet', 'getAreaParameters',
				'getGeolocation',
				'getCutEfficiency', 'getObstacleHeight', 'getCutHeight', 'getCutDirection',
				'getAutoCutDirection', 'getRainDelay', 'getAnimProtect', 'getTimeZone',
				'getCustomCutMode', 'getBorderSwitch',
				'getMapAr', 'getArInfo', 'getMapInfo'
			];

			for (const getter of gettersToCall) {
				if (typeof device[getter] === 'function') {
					const stateKey = getter.slice(3); // Remove 'get' prefix
					const value = device[getter]();
					if (value !== null && value !== undefined) {
						snapshot[stateKey] = value;
					}
				}
			}

			return snapshot;
		} catch (error) {
			this.adapter.log.debug(`[Client V2] getInitialSnapshot error: ${error.message}`);
			return {};
		}
	}

	/**
	 * Map Api2Device to adapter-friendly format
	 * @private
	 */
	_mapApi2Device(api2Device) {
		return {
			id: api2Device.id || null,
			name: api2Device.name || api2Device.nickName || 'Unknown',
			nickName: api2Device.nickName || null,
			className: api2Device.className || null,
			productCategory: api2Device.productCategory || null,
			isConnected: api2Device.isConnected || false,
			api2Device: api2Device, // Store reference for later use
		};
	}

	/**
	 * Disconnect and cleanup
	 * @returns {Promise<void>}
	 */
	async disconnect() {
		try {
			if (this.factory && typeof this.factory.disconnect === 'function') {
				await this.factory.disconnect();
				this.adapter.log.info('[Client V2] Disconnected from ECOVACS');
			}
			this.isConnected = false;
		} catch (error) {
			this.adapter.log.warn(`[Client V2] Disconnect error: ${error.message}`);
		}
	}

	/**
	 * Get device reference by channel key
	 * @param {string} channelKey
	 * @returns {Object|null}
	 */
	getDevice(channelKey) {
		return this.deviceMap[channelKey] || null;
	}

	/**
	 * Request ArInfo data (on-demand map visualization)
	 * @param {string} channelKey
	 * @param {string} type
	 * @param {Object} options { mid, aid }
	 * @returns {Promise<Object|null>}
	 */
	async requestArInfo(channelKey, type = '0', options = {}) {
		try {
			const device = this.getDevice(channelKey);
			if (!device || typeof device.requestArInfo !== 'function') {
				return null;
			}
			return await device.requestArInfo(type, options);
		} catch (error) {
			this.adapter.log.warn(`[Client V2] requestArInfo failed: ${error.message}`);
			return null;
		}
	}

	/**
	 * Request MapInfo data (on-demand map data)
	 * @param {string} channelKey
	 * @param {string} type
	 * @param {Object} options { mid, aid }
	 * @returns {Promise<Object|null>}
	 */
	async requestMapInfo(channelKey, type = '0', options = {}) {
		try {
			const device = this.getDevice(channelKey);
			if (!device || typeof device.requestMapInfo !== 'function') {
				return null;
			}
			return await device.requestMapInfo(type, options);
		} catch (error) {
			this.adapter.log.warn(`[Client V2] requestMapInfo failed: ${error.message}`);
			return null;
		}
	}
}

module.exports = EcovacsClientV2;
