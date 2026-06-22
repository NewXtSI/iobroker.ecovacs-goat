'use strict';

/*
 * ECOVACS GOAT Series Adapter
 * Adapter for controlling ECOVACS GOAT series devices via MQTT
 * Uses node-ecovacs.js library for device communication
 */

const utils = require('@iobroker/adapter-core');
const EcovacsClient = require('./lib/ecovacs-client');

class EcovacsGoat extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	constructor(options) {
		super({
			...options,
			name: 'ecovacs-goat',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

		// Initialize adapter state
		this.isConnected = false;
		this.devices = {};
		this.ecovacsClient = null;
		this.debugFlags = {
			auth: false,
			topics: false,
			rawTraffic: false,
		};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		try {
			this.log.info('ecovacs-goat adapter starting...');

			// Set debug flags from config
			this.debugFlags.auth = this.config.debugAuth || false;
			this.debugFlags.topics = this.config.debugTopics || false;
			this.debugFlags.rawTraffic = this.config.debugRawTraffic || false;

			if (this.debugFlags.auth) {
				this.log.debug('[DEBUG] Authentication debugging enabled');
			}
			if (this.debugFlags.topics) {
				this.log.debug('[DEBUG] Topics/Commands debugging enabled');
			}
			if (this.debugFlags.rawTraffic) {
				this.log.debug('[DEBUG] Raw MQTT traffic debugging enabled');
			}

			// Validate configuration
			if (!this.config.username || !this.config.password) {
				this.log.warn('Username or password not configured. Please configure credentials in admin panel.');
				return;
			}

			// Create state objects if they don't exist
			await this.setObjectNotExistsAsync('info', {
				type: 'channel',
				common: {
					name: 'Device Information',
					desc: 'Adapter status and connection information',
				},
				native: {},
			});

			await this.setObjectNotExistsAsync('info.connection', {
				type: 'state',
				common: {
					name: 'Connection Status',
					type: 'boolean',
					role: 'indicator.connected',
					read: true,
					write: false,
					def: false,
				},
				native: {},
			});

			await this.setObjectNotExistsAsync('info.lastUpdate', {
				type: 'state',
				common: {
					name: 'Last Update',
					type: 'number',
					role: 'value.time',
					read: true,
					write: false,
					unit: 'ms',
				},
				native: {},
			});

			await this.setObjectNotExistsAsync('devices', {
				type: 'channel',
				common: {
					name: 'ECOVACS Devices',
					desc: 'Container for connected ECOVACS GOAT devices',
				},
				native: {},
			});

			// Subscribe to state changes
			this.subscribeStates('*');

			// Initialize ECOVACS client
			this.ecovacsClient = new EcovacsClient(this, this.config);

			// Initialize connection to external ECOVACS library
			await this.initializeConnection();

			// Device discovery happens automatically via external library on startup
			await this.performDeviceDiscovery();

			this.log.info('ecovacs-goat adapter ready');
		} catch (error) {
			this.log.error(`Error during onReady: ${error.message}`);
		}
	}

	/**
	 * Initialize connection to external ECOVACS library
	 */
	async initializeConnection() {
		try {
			if (!this.ecovacsClient) {
				throw new Error('ECOVACS client not initialized');
			}

			const connected = await this.ecovacsClient.connect();

			if (connected) {
				await this.setState('info.connection', true, true);
				this.isConnected = true;
				this.log.info('Connected to ECOVACS service');
			} else {
				await this.setState('info.connection', false, true);
				this.isConnected = false;
				this.log.warn('Failed to connect to ECOVACS service');
			}
		} catch (error) {
			this.log.error(`Failed to initialize connection: ${error.message}`);
			await this.setState('info.connection', false, true);
			this.isConnected = false;
		}
	}

	/**
	 * Perform device discovery (automatically via external library on startup)
	 */
	async performDeviceDiscovery() {
		try {
			if (!this.isConnected || !this.ecovacsClient) {
				this.log.debug('Not connected, skipping device discovery');
				return;
			}

			this.log.debug('Performing device discovery...');

			const discoveredDevices = await this.ecovacsClient.discoverDevices();

			this.log.info(`Device discovery returned ${discoveredDevices.length} device(s)`);
			
			if (discoveredDevices.length > 0) {
				this.log.debug(`Discovered devices: ${JSON.stringify(discoveredDevices).substring(0, 500)}`);
				await this.processDiscoveredDevices(discoveredDevices);
			} else {
				this.log.warn('No devices discovered. Check your ECOVACS account and credentials.');
			}

			this.log.debug('Device discovery completed');
		} catch (error) {
			this.log.error(`Device discovery failed: ${error.message}`);
			this.log.debug(`Discovery error details: ${error.stack}`);
		}
	}

	/**
	 * Process discovered devices
	 */
	async processDiscoveredDevices(devices) {
		try {
			this.log.info(`Processing ${devices.length} discovered device(s)...`);
			
			for (const device of devices) {
				// Extract device properties (adapt to actual library structure)
				const deviceId = device.id || device.deviceId || device.did || device.device_id;
				const deviceName = device.name || device.deviceName || `Device ${deviceId}`;
				const deviceModel = device.model || device.modelName || device.deviceModel || 'Unknown';

				if (!deviceId) {
					this.log.warn(`Skipping device without ID: ${JSON.stringify(device)}`);
					continue;
				}

				this.log.info(`Creating device channel: ${deviceId} (${deviceName}) - Model: ${deviceModel}`);

				const channelId = `devices.${deviceId}`;

				// Create device channel
				await this.setObjectNotExistsAsync(channelId, {
					type: 'channel',
					common: {
						name: deviceName,
						desc: `ECOVACS Device: ${deviceModel}`,
					},
					native: device,
				});

				// Create states for device
				await this.setObjectNotExistsAsync(`${channelId}.status`, {
					type: 'state',
					common: {
						name: 'Device Status',
						type: 'string',
						role: 'info.status',
						read: true,
						write: false,
					},
					native: {},
				});

				await this.setObjectNotExistsAsync(`${channelId}.battery`, {
					type: 'state',
					common: {
						name: 'Battery Level',
						type: 'number',
						role: 'value.battery',
						read: true,
						write: false,
						unit: '%',
						min: 0,
						max: 100,
					},
					native: {},
				});

				// Set initial state
				await this.setState(`${channelId}.status`, 'connected', true);
				await this.setState(`${channelId}.battery`, 0, true);

				this.devices[deviceId] = device;
			}

			this.log.info(`Discovered and configured ${devices.length} device(s)`);
			await this.setState('info.lastUpdate', Date.now(), true);
		} catch (error) {
			this.log.error(`Error processing discovered devices: ${error.message}`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id - the id of the state
	 * @param {ioBroker.State | null | undefined} state - the new state, deleted states have state.val = null
	 */
	async onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			// Handle incoming commands from ioBroker
			if (!state.ack) {
				// This is a command from ioBroker, not an ACK from device
				if (this.debugFlags.topics) {
					this.log.debug(`[DEBUG-TOPICS] Command received for ${id}: ${state.val}`);
				}

				// Parse command (e.g., devices.device_001.command = 'start')
				const parts = id.split('.');
				if (parts.length >= 3 && parts[0] === 'devices') {
					const deviceId = parts[1];
					const command = state.val;

					// Send command to device via ECOVACS client
					if (this.ecovacsClient && this.isConnected) {
						await this.ecovacsClient.sendCommand(deviceId, command);
					}
				}
			}
		} else {
			// The state was deleted
			this.log.debug(`state ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id - the id of the object
	 * @param {ioBroker.Object | null | undefined} obj - the new object
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.debug(`object ${id} deleted`);
		}
	}

	/**
	 * Some message was sent to this instance over message box.
	 * Used by admin interface to request device list.
	 * @param {ioBroker.Message} obj - the message sent to this instance
	 */
	async onMessage(obj) {
		if (obj.command === 'getDevices') {
			// Return device list from ECOVACS client
			const devices = this.ecovacsClient ? this.ecovacsClient.getDevices() : [];
			if (obj.callback) {
				this.sendTo(obj.from, obj.command, devices, obj.callback);
			}
		}
	}

	/**
	 * Is called when the adapter shuts down - at least one "stop" message was received.
	 */
	async onUnload() {
		try {
			// Disconnect from ECOVACS service
			if (this.ecovacsClient) {
				await this.ecovacsClient.disconnect();
			}

			// Set connection status to false
			await this.setState('info.connection', false, true);
			this.isConnected = false;

			this.log.info('ecovacs-goat adapter unloaded');
		} catch (error) {
			this.log.error(`Error during unload: ${error.message}`);
		}
	}
}

// Create the adapter instance
if (require.main === module) {
	// eslint-disable-next-line no-new
	new EcovacsGoat();
}

module.exports = EcovacsGoat;
