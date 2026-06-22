'use strict';

/*
 * ECOVACS GOAT Series Adapter
 * Adapter for controlling ECOVACS GOAT series devices via MQTT
 * Requires external MQTT library for device communication
 */

const utils = require('@iobroker/adapter-core');

// Placeholder for external MQTT library
// This library will be used for device communication
// let EcovacsGoatLib = null;

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

			// Initialize connection to external MQTT library
			await this.initializeConnection();

			// Device discovery happens automatically via external library on startup
			await this.performDeviceDiscovery();

			this.log.info('ecovacs-goat adapter ready');
		} catch (error) {
			this.log.error(`Error during onReady: ${error.message}`);
		}
	}

	/**
	 * Initialize connection to external MQTT library
	 */
	async initializeConnection() {
		try {
			// TODO: Replace with actual external library import
			// const EcovacsGoatLib = require('ecovacs-goat-lib'); // Placeholder
			// this.mqttClient = await EcovacsGoatLib.connect({
			//     username: this.config.username,
			//     password: this.config.password,
			//     debugAuth: this.debugFlags.auth,
			//     debugTopics: this.debugFlags.topics,
			//     debugRawTraffic: this.debugFlags.rawTraffic
			// });

			if (this.debugFlags.auth) {
				this.log.debug('[DEBUG-AUTH] Connection attempt (external lib placeholder)');
			}

			// For now, just set connection status to false
			await this.setState('info.connection', false, true);

			this.log.debug('Connection initialization - waiting for external library');
		} catch (error) {
			this.log.error(`Failed to initialize connection: ${error.message}`);
			await this.setState('info.connection', false, true);
		}
	}

	/**
	 * Perform device discovery (automatically via external library on startup)
	 */
	async performDeviceDiscovery() {
		try {
			this.log.debug('Performing device discovery...');

			// TODO: Get devices from external library
			// const discoveredDevices = await this.mqttClient.discoverDevices();
			// this.processDiscoveredDevices(discoveredDevices);

			// For now, this is a placeholder for mock devices
			if (this.debugFlags.topics) {
				this.log.debug('[DEBUG-TOPICS] Device discovery request sent');
			}

			this.log.debug('Device discovery completed');
		} catch (error) {
			this.log.error(`Device discovery failed: ${error.message}`);
		}
	}

	/**
	 * Process discovered devices
	 */
	async processDiscoveredDevices(devices) {
		try {
			for (const device of devices) {
				// Create device channel if not exists
				const deviceId = device.id || device.deviceId;
				const channelId = `devices.${deviceId}`;

				await this.setObjectNotExistsAsync(channelId, {
					type: 'channel',
					common: {
						name: device.name || `Device ${deviceId}`,
						desc: `ECOVACS Device: ${device.model || 'Unknown'}`,
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
			}

			this.log.debug(`Discovered ${devices.length} device(s)`);
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
				// TODO: Send command to device via external library
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
			// Return mock devices or real devices from library
			const devices = await this.getDeviceList();
			if (obj.callback) {
				this.sendTo(obj.from, obj.command, devices, obj.callback);
			}
		}
	}

	/**
	 * Get device list (mock for now)
	 */
	async getDeviceList() {
		try {
			// TODO: Replace with actual external library call
			// return await this.mqttClient.getDeviceList();

			// Mock devices for demonstration
			const mockDevices = [
				{ id: 'device_001', name: 'Living Room Vacuum', model: 'GOAT-X1', status: 'connected', battery: 85 },
				{ id: 'device_002', name: 'Bedroom Vacuum', model: 'GOAT-X2', status: 'offline', battery: 20 },
				{ id: 'device_003', name: 'Kitchen Robot', model: 'GOAT-PRO', status: 'connected', battery: 100 }
			];

			return mockDevices;
		} catch (error) {
			this.log.error(`Failed to get device list: ${error.message}`);
			return [];
		}
	}

	/**
	 * Is called when the adapter shuts down - at least one "stop" message was received.
	 */
	async onUnload() {
		try {
			// TODO: Disconnect from external library
			// if (this.mqttClient) {
			//     await this.mqttClient.disconnect();
			// }

			// Set connection status to false
			await this.setState('info.connection', false, true);

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
