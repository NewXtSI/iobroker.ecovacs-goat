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

			await this.ensureObjectType('devices', 'folder', {
				name: 'ECOVACS Devices',
				desc: 'Container for connected ECOVACS GOAT devices',
			}, {});

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
	 * Ensure an object exists with the desired type.
	 * If an object exists with a different type, it is replaced.
	 * @param {string} id object id
	 * @param {'state'|'channel'|'folder'} type desired object type
	 * @param {ioBroker.StateCommon | ioBroker.ChannelCommon | ioBroker.FolderCommon} common common section
	 * @param {object} native native section
	 */
	async ensureObjectType(id, type, common, native = {}) {
		const existing = await this.getObjectAsync(id);

		if (existing && existing.type !== type) {
			this.log.info(`Migrating object ${id} from type ${existing.type} to ${type}`);
			await this.delObjectAsync(id, { recursive: true });
		}

		await this.setObjectNotExistsAsync(id, {
			type,
			common,
			native,
		});
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

			const discoveryResult = await this.ecovacsClient.discoverDevices();
			const discoveredDevices = Array.isArray(discoveryResult) ? discoveryResult : [];

			this.log.info(`Device discovery returned ${discoveredDevices.length} device(s)`);
			if (!Array.isArray(discoveryResult)) {
				this.log.warn(`Device discovery returned non-array result type: ${typeof discoveryResult}`);
			}
			
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
				const deviceId = device.id || device.deviceId || device.did || device.device_id;
				if (!deviceId) {
					this.log.warn(`Skipping device without ID: ${JSON.stringify(device)}`);
					continue;
				}

				// Use serial number as channel name (stable, unique), fall back to id
				const serial = device.serial || deviceId;
				const channelKey = serial.replace(/[^a-zA-Z0-9_-]/g, '_');

				// Human-readable display name: user nick or deviceName or serial
				const displayName = device.nick || device.deviceName || serial;
				const deviceModel = device.model || 'Unknown';
				const deviceModelLabel = device.deviceName || deviceModel;
				const nickName = device.nick || null;
				const position = device.position && typeof device.position === 'object' ? device.position : {};
				const mowInfo = device.mowInfo && typeof device.mowInfo === 'object' ? device.mowInfo : {};
				const lifeSpan = device.lifeSpan && typeof device.lifeSpan === 'object' ? device.lifeSpan : {};
				const totalStats = device.totalStats && typeof device.totalStats === 'object' ? device.totalStats : {};
				const deviceDesc =
					`ECOVACS Device: ${deviceModelLabel}` +
					(nickName ? ` | Nickname: ${nickName}` : '') +
					` | Serial: ${serial}`;

				this.log.info(`Creating device channel: ${channelKey} (${displayName}) - Model: ${deviceModelLabel}`);

				const channelId = `devices.${channelKey}`;

				// Create device folder (no channel-in-channel nesting)
				await this.ensureObjectType(channelId, 'folder', {
					name: displayName,
					desc: deviceDesc,
				}, device);

				// Create states for device
				await this.ensureObjectType(`${channelId}.name`, 'state', {
					name: 'Device Name',
					type: 'string',
					role: 'info.name',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.model`, 'state', {
					name: 'Device Model',
					type: 'string',
					role: 'info.hardware',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.status`, 'state', {
					name: 'Device Status',
					type: 'string',
					role: 'info.status',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.battery`, 'state', {
					name: 'Battery Level',
					type: 'number',
					role: 'value.battery',
					read: true,
					write: false,
					unit: '%',
					min: 0,
					max: 100,
				}, {});

				// Position as channel with x/y/a states
				await this.ensureObjectType(`${channelId}.position`, 'channel', {
					name: 'Position',
					desc: 'Current mower position',
				}, {});

				await this.ensureObjectType(`${channelId}.position.x`, 'state', {
					name: 'X',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.position.y`, 'state', {
					name: 'Y',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.position.a`, 'state', {
					name: 'A',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				// MowInfo as channel with substates
				await this.ensureObjectType(`${channelId}.mowInfo`, 'channel', {
					name: 'Mow Info',
					desc: 'Current mowing status information',
				}, {});

				await this.ensureObjectType(`${channelId}.mowInfo.trigger`, 'state', {
					name: 'Trigger',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowInfo.other`, 'state', {
					name: 'Other',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowInfo.state`, 'state', {
					name: 'State',
					type: 'string',
					role: 'info.status',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowInfo.type`, 'state', {
					name: 'Type',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				// LifeSpan as channel with blade/lensBrush substates
				await this.ensureObjectType(`${channelId}.lifeSpan`, 'channel', {
					name: 'Life Span',
					desc: 'Consumables life span information',
				}, {});

				await this.ensureObjectType(`${channelId}.lifeSpan.blade`, 'channel', {
					name: 'Blade',
					desc: 'Blade remaining life span',
				}, {});

				await this.ensureObjectType(`${channelId}.lifeSpan.blade.left`, 'state', {
					name: 'Blade Left',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.lifeSpan.blade.total`, 'state', {
					name: 'Blade Total',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.lifeSpan.lensBrush`, 'channel', {
					name: 'Lens Brush',
					desc: 'Lens brush remaining life span',
				}, {});

				await this.ensureObjectType(`${channelId}.lifeSpan.lensBrush.left`, 'state', {
					name: 'Lens Brush Left',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.lifeSpan.lensBrush.total`, 'state', {
					name: 'Lens Brush Total',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				// TotalStats as channel with common metrics + raw JSON for forward compatibility
				await this.ensureObjectType(`${channelId}.totalStats`, 'channel', {
					name: 'Total Stats',
					desc: 'Aggregated operation statistics',
				}, {});

				await this.ensureObjectType(`${channelId}.totalStats.area`, 'state', {
					name: 'Area',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.totalStats.time`, 'state', {
					name: 'Time',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.totalStats.count`, 'state', {
					name: 'Count',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.totalStats.raw`, 'state', {
					name: 'Raw Total Stats',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				// Set initial states
				await this.setState(`${channelId}.name`, displayName, true);
				await this.setState(`${channelId}.model`, deviceModelLabel, true);
				await this.setState(`${channelId}.status`, 'connected', true);
				if (device.battery !== undefined && device.battery !== null) {
					await this.setState(`${channelId}.battery`, Number(device.battery), true);
				}
				if (Object.prototype.hasOwnProperty.call(position, 'x') && Number.isFinite(Number(position.x))) {
					await this.setState(`${channelId}.position.x`, Number(position.x), true);
				}
				if (Object.prototype.hasOwnProperty.call(position, 'y') && Number.isFinite(Number(position.y))) {
					await this.setState(`${channelId}.position.y`, Number(position.y), true);
				}
				if (Object.prototype.hasOwnProperty.call(position, 'a') && Number.isFinite(Number(position.a))) {
					await this.setState(`${channelId}.position.a`, Number(position.a), true);
				}
				if (Object.prototype.hasOwnProperty.call(mowInfo, 'trigger')) {
					await this.setState(`${channelId}.mowInfo.trigger`, mowInfo.trigger != null ? String(mowInfo.trigger) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(mowInfo, 'other')) {
					await this.setState(`${channelId}.mowInfo.other`, mowInfo.other != null ? String(mowInfo.other) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(mowInfo, 'state')) {
					await this.setState(`${channelId}.mowInfo.state`, mowInfo.state != null ? String(mowInfo.state) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(mowInfo, 'type')) {
					await this.setState(`${channelId}.mowInfo.type`, mowInfo.type != null ? String(mowInfo.type) : '', true);
				}
				if (lifeSpan.blade && Object.prototype.hasOwnProperty.call(lifeSpan.blade, 'left') && Number.isFinite(Number(lifeSpan.blade.left))) {
					await this.setState(`${channelId}.lifeSpan.blade.left`, Number(lifeSpan.blade.left), true);
				}
				if (lifeSpan.blade && Object.prototype.hasOwnProperty.call(lifeSpan.blade, 'total') && Number.isFinite(Number(lifeSpan.blade.total))) {
					await this.setState(`${channelId}.lifeSpan.blade.total`, Number(lifeSpan.blade.total), true);
				}
				if (lifeSpan.lensBrush && Object.prototype.hasOwnProperty.call(lifeSpan.lensBrush, 'left') && Number.isFinite(Number(lifeSpan.lensBrush.left))) {
					await this.setState(`${channelId}.lifeSpan.lensBrush.left`, Number(lifeSpan.lensBrush.left), true);
				}
				if (lifeSpan.lensBrush && Object.prototype.hasOwnProperty.call(lifeSpan.lensBrush, 'total') && Number.isFinite(Number(lifeSpan.lensBrush.total))) {
					await this.setState(`${channelId}.lifeSpan.lensBrush.total`, Number(lifeSpan.lensBrush.total), true);
				}
				if (Object.prototype.hasOwnProperty.call(totalStats, 'area') && Number.isFinite(Number(totalStats.area))) {
					await this.setState(`${channelId}.totalStats.area`, Number(totalStats.area), true);
				}
				if (Object.prototype.hasOwnProperty.call(totalStats, 'time') && Number.isFinite(Number(totalStats.time))) {
					await this.setState(`${channelId}.totalStats.time`, Number(totalStats.time), true);
				}
				if (Object.prototype.hasOwnProperty.call(totalStats, 'count') && Number.isFinite(Number(totalStats.count))) {
					await this.setState(`${channelId}.totalStats.count`, Number(totalStats.count), true);
				}
				if (Object.keys(totalStats).length > 0) {
					await this.setState(`${channelId}.totalStats.raw`, JSON.stringify(totalStats), true);
				}

				this.devices[channelKey] = device;

				if (this.ecovacsClient) {
					await this.ecovacsClient.setupDeviceCallbacks(device, channelKey, this.handleRealtimeDeviceUpdate.bind(this));
				}
			}

			this.log.info(`Discovered and configured ${devices.length} device(s)`);
			await this.setState('info.lastUpdate', Date.now(), true);
		} catch (error) {
			this.log.error(`Error processing discovered devices: ${error.message}`);
		}
	}

	/**
	 * Handle realtime updates from library callbacks
	 * @param {string} channelKey - Device channel key
	 * @param {Object} update - Partial update payload
	 */
	async handleRealtimeDeviceUpdate(channelKey, update) {
		try {
			const channelId = `devices.${channelKey}`;

			if (update.battery !== undefined && update.battery !== null) {
				await this.setState(`${channelId}.battery`, Number(update.battery) || 0, true);
			}

			if (update.mowInfo !== undefined) {
				const mowInfo = update.mowInfo && typeof update.mowInfo === 'object' ? update.mowInfo : null;
				if (mowInfo && Object.prototype.hasOwnProperty.call(mowInfo, 'trigger')) {
					await this.setState(`${channelId}.mowInfo.trigger`, mowInfo.trigger != null ? String(mowInfo.trigger) : '', true);
				}
				if (mowInfo && Object.prototype.hasOwnProperty.call(mowInfo, 'other')) {
					await this.setState(`${channelId}.mowInfo.other`, mowInfo.other != null ? String(mowInfo.other) : '', true);
				}
				if (mowInfo && Object.prototype.hasOwnProperty.call(mowInfo, 'state')) {
					await this.setState(`${channelId}.mowInfo.state`, mowInfo.state != null ? String(mowInfo.state) : '', true);
				}
				if (mowInfo && Object.prototype.hasOwnProperty.call(mowInfo, 'type')) {
					await this.setState(`${channelId}.mowInfo.type`, mowInfo.type != null ? String(mowInfo.type) : '', true);
				}
			}

			if (update.position !== undefined) {
				const position = update.position && typeof update.position === 'object' ? update.position : null;
				if (position && Object.prototype.hasOwnProperty.call(position, 'x')) {
					const x = Number(position.x);
					if (Number.isFinite(x)) {
						await this.setState(`${channelId}.position.x`, x, true);
					}
				}
				if (position && Object.prototype.hasOwnProperty.call(position, 'y')) {
					const y = Number(position.y);
					if (Number.isFinite(y)) {
						await this.setState(`${channelId}.position.y`, y, true);
					}
				}
				if (position && Object.prototype.hasOwnProperty.call(position, 'a')) {
					const a = Number(position.a);
					if (Number.isFinite(a)) {
						await this.setState(`${channelId}.position.a`, a, true);
					}
				}
			}

			if (update.lifeSpan !== undefined) {
				const lifeSpan = update.lifeSpan && typeof update.lifeSpan === 'object' ? update.lifeSpan : null;
				if (lifeSpan && lifeSpan.blade && Object.prototype.hasOwnProperty.call(lifeSpan.blade, 'left')) {
					const bladeLeft = Number(lifeSpan.blade.left);
					if (Number.isFinite(bladeLeft)) {
						await this.setState(`${channelId}.lifeSpan.blade.left`, bladeLeft, true);
					}
				}
				if (lifeSpan && lifeSpan.blade && Object.prototype.hasOwnProperty.call(lifeSpan.blade, 'total')) {
					const bladeTotal = Number(lifeSpan.blade.total);
					if (Number.isFinite(bladeTotal)) {
						await this.setState(`${channelId}.lifeSpan.blade.total`, bladeTotal, true);
					}
				}
				if (lifeSpan && lifeSpan.lensBrush && Object.prototype.hasOwnProperty.call(lifeSpan.lensBrush, 'left')) {
					const lensBrushLeft = Number(lifeSpan.lensBrush.left);
					if (Number.isFinite(lensBrushLeft)) {
						await this.setState(`${channelId}.lifeSpan.lensBrush.left`, lensBrushLeft, true);
					}
				}
				if (lifeSpan && lifeSpan.lensBrush && Object.prototype.hasOwnProperty.call(lifeSpan.lensBrush, 'total')) {
					const lensBrushTotal = Number(lifeSpan.lensBrush.total);
					if (Number.isFinite(lensBrushTotal)) {
						await this.setState(`${channelId}.lifeSpan.lensBrush.total`, lensBrushTotal, true);
					}
				}
			}

			if (update.totalStats !== undefined) {
				const totalStats = update.totalStats && typeof update.totalStats === 'object' ? update.totalStats : null;
				if (totalStats && Object.prototype.hasOwnProperty.call(totalStats, 'area')) {
					const area = Number(totalStats.area);
					if (Number.isFinite(area)) {
						await this.setState(`${channelId}.totalStats.area`, area, true);
					}
				}
				if (totalStats && Object.prototype.hasOwnProperty.call(totalStats, 'time')) {
					const time = Number(totalStats.time);
					if (Number.isFinite(time)) {
						await this.setState(`${channelId}.totalStats.time`, time, true);
					}
				}
				if (totalStats && Object.prototype.hasOwnProperty.call(totalStats, 'count')) {
					const count = Number(totalStats.count);
					if (Number.isFinite(count)) {
						await this.setState(`${channelId}.totalStats.count`, count, true);
					}
				}
				if (totalStats) {
					await this.setState(`${channelId}.totalStats.raw`, JSON.stringify(totalStats), true);
				}
			}

			if (update.status !== undefined && update.status !== null) {
				await this.setState(`${channelId}.status`, String(update.status), true);
			}

			await this.setState('info.lastUpdate', Date.now(), true);
		} catch (error) {
			this.log.debug(`Failed to process realtime update for ${channelKey}: ${error.message}`);
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
