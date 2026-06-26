'use strict';

/*
 * ECOVACS GOAT Series Adapter
 * Adapter for controlling ECOVACS GOAT series devices via MQTT
 * Uses node-ecovacs.js library for device communication
 */

const utils = require('@iobroker/adapter-core');
const EcovacsClientV2 = require('./lib/ecovacs-client-v2');

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
		this.rawStatesEnabled = true;
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
			this.rawStatesEnabled = this.config.rawStates !== false;

			if (this.debugFlags.auth) {
				this.log.debug('[DEBUG] Authentication debugging enabled');
			}
			if (this.debugFlags.topics) {
				this.log.debug('[DEBUG] Topics/Commands debugging enabled');
			}
			if (this.debugFlags.rawTraffic) {
				this.log.debug('[DEBUG] Raw MQTT traffic debugging enabled');
			}
			if (!this.rawStatesEnabled) {
				this.log.info('Raw JSON state updates are disabled by configuration (rawStates=false)');
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

			if (!this.rawStatesEnabled) {
				await this.cleanupRawStates();
			}

			// Subscribe to state changes
			this.subscribeStates('*');

			// Initialize ECOVACS client (API V2)
			this.ecovacsClient = new EcovacsClientV2(this, this.config);

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
	 * If an object exists with a different type and recreateStructureOnStart is enabled, replace it.
	 * @param {string} id object id
	 * @param {'state'|'channel'|'folder'} type desired object type
	 * @param {ioBroker.StateCommon | ioBroker.ChannelCommon | ioBroker.FolderCommon} common common section
	 * @param {object} native native section
	 */
	async ensureObjectType(id, type, common, native = {}) {
		if (type === 'state' && this.isRawStateId(id) && !this.rawStatesEnabled) {
			return;
		}

		const existing = await this.getObjectAsync(id);
		const shouldRecreate = this.config.recreateStructureOnStart === true;

		if (existing && existing.type !== type && shouldRecreate) {
			this.log.info(`Migrating object ${id} from type ${existing.type} to ${type}`);
			await this.delObjectAsync(id, { recursive: true });
		} else if (existing && existing.type !== type && !shouldRecreate) {
			if (this.debugFlags.topics) {
				this.log.debug(`[Skipped migration] Object ${id} has type ${existing.type} but needs ${type}. Enable recreateStructureOnStart to fix.`);
			}
			return; // Skip if type mismatch and flag not set
		}

		await this.setObjectNotExistsAsync(id, {
			type,
			common,
			native,
		});
	}

	/**
	 * Determine whether a state ID is considered a raw JSON state.
	 * @param {string} id
	 * @returns {boolean}
	 */
	isRawStateId(id) {
		return id.endsWith('.raw') || id.endsWith('Raw') || id.endsWith('.areaSet');
	}

	/**
	 * Create a raw state only when raw states are enabled.
	 * @param {string} id
	 * @param {ioBroker.StateCommon} common
	 * @param {object} native
	 */
	async ensureRawState(id, common, native = {}) {
		if (!this.rawStatesEnabled || !this.isRawStateId(id)) {
			return;
		}
		await this.ensureObjectType(id, 'state', common, native);
	}

	/**
	 * Write a raw state only when raw states are enabled.
	 * @param {string} id
	 * @param {any} value
	 * @param {boolean} ack
	 */
	async setRawState(id, value, ack = true) {
		if (!this.rawStatesEnabled || !this.isRawStateId(id)) {
			return;
		}
		await this.setState(id, value, ack);
	}

	/**
	 * Remove existing raw state objects and values when raw states are disabled.
	 * Keeps the object tree clean and prevents stale JSON payloads from lingering.
	 */
	async cleanupRawStates() {
		const startkey = `${this.namespace}.devices.`;
		const endkey = `${this.namespace}.devices.\u9999`;

		let removed = 0;
		let failed = 0;

		try {
			const result = await this.getObjectListAsync({ startkey, endkey });
			const rows = Array.isArray(result && result.rows) ? result.rows : [];

			for (const row of rows) {
				const fullId = typeof row.id === 'string' ? row.id : '';
				if (!fullId.startsWith(`${this.namespace}.`)) {
					continue;
				}

				const localId = fullId.slice(this.namespace.length + 1);
				if (!this.isRawStateId(localId)) {
					continue;
				}

				try {
					await this.delStateAsync(localId).catch(() => {});
					await this.delObjectAsync(localId);
					removed++;
				} catch (error) {
					failed++;
					this.log.warn(`Failed to remove raw state ${localId}: ${error.message}`);
				}
			}

			this.log.info(`Raw state cleanup finished: removed=${removed}, failed=${failed}`);
		} catch (error) {
			this.log.warn(`Raw state cleanup failed: ${error.message}`);
		}
	}

	/**
	 * Ensure area structure based on areaParameters array
	 * Creates dynamic channels for each area with its parameters
	 * @param {string} channelId - Device channel ID (e.g., 'devices.device_serial')
	 * @param {Array} areaParameters - Array of area parameter objects with areaID, mowHeightLevel, cutMode, obstacleHeight
	 */
	async ensureAreaStructure(channelId, areaParameters) {
		try {
			if (!Array.isArray(areaParameters) || areaParameters.length === 0) {
				this.log.debug(`No area parameters for ${channelId}, skipping area structure creation`);
				return;
			}

			// Create Areas folder
			await this.ensureObjectType(`${channelId}.areas`, 'folder', {
				name: 'Areas',
				desc: 'Mowing areas with individual parameters',
			}, {});

			// Get existing area channels to clean up removed ones
			const existingAreas = new Set();
			try {
				const areasFolder = await this.getObjectAsync(`${channelId}.areas`);
				if (areasFolder && areasFolder.children) {
					areasFolder.children.forEach(child => {
						const areaIdMatch = child.match(/.*\.areas\.(.+)$/);
						if (areaIdMatch) {
							existingAreas.add(areaIdMatch[1]);
						}
					});
				}
			} catch (err) {
				this.log.debug(`Could not retrieve existing areas for ${channelId}: ${err.message}`);
			}

			const currentAreaIds = new Set();

			// Create/update channels for each area
			for (const areaParam of areaParameters) {
				const areaID = String(areaParam.areaID ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
				if (!areaID) {
					this.log.warn(`Skipping area without valid ID: ${JSON.stringify(areaParam)}`);
					continue;
				}

				currentAreaIds.add(areaID);
				const areaChannelId = `${channelId}.areas.${areaID}`;

				// Create area channel
				await this.ensureObjectType(areaChannelId, 'channel', {
					name: `Area ${areaID}`,
					desc: `Parameters for area ${areaID}`,
				}, {});

				// Create mowHeightLevel state
				await this.ensureObjectType(`${areaChannelId}.mowHeightLevel`, 'state', {
					name: 'Mow Height Level',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				// Create cutMode state
				await this.ensureObjectType(`${areaChannelId}.cutMode`, 'state', {
					name: 'Cut Mode',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
					states: {
						'1': 'Effizient (0,5m/s)',
						'2': 'Fein (0,35 m/s)',
					},
				}, {});

				// Create obstacleHeight state
				await this.ensureObjectType(`${areaChannelId}.obstacleHeight`, 'state', {
					name: 'Obstacle Height',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
					states: {
						'1': 'Flacher Untergrund (>10cm)',
						'2': 'Normale Umgebung (>15cm)',
						'3': 'Hohes Gras (>20cm)',
					},
				}, {});

				// Create raw JSON state
				await this.ensureObjectType(`${areaChannelId}.raw`, 'state', {
					name: 'Raw Area Parameters',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				// Set initial values
				if (Number.isFinite(Number(areaParam.mowHeightLevel))) {
					await this.setState(`${areaChannelId}.mowHeightLevel`, Number(areaParam.mowHeightLevel), true);
				}
				if (Number.isFinite(Number(areaParam.cutMode))) {
					const cutModeValue = Number(areaParam.cutMode);
					await this.setState(`${areaChannelId}.cutMode`, cutModeValue, true);
				}
				if (Number.isFinite(Number(areaParam.obstacleHeight))) {
					const obstacleHeightValue = Number(areaParam.obstacleHeight);
					await this.setState(`${areaChannelId}.obstacleHeight`, obstacleHeightValue, true);
				}
				await this.setRawState(`${areaChannelId}.raw`, JSON.stringify(areaParam), true);
			}

			// Clean up removed areas
			for (const existingAreaId of existingAreas) {
				if (!currentAreaIds.has(existingAreaId)) {
					const removedAreaChannelId = `${channelId}.areas.${existingAreaId}`;
					this.log.info(`Removing area channel ${removedAreaChannelId} (no longer in areaParameters)`);
					try {
						await this.delObjectAsync(removedAreaChannelId, { recursive: true });
					} catch (err) {
						this.log.warn(`Failed to remove area channel ${removedAreaChannelId}: ${err.message}`);
					}
				}
			}

			this.log.debug(`Area structure ensured for ${channelId} with ${areaParameters.length} area(s)`);
		} catch (error) {
			this.log.error(`Error ensuring area structure for ${channelId}: ${error.message}`);
		}
	}

	/**
	 * Ensure fwBuryPoint root structure as folder and migrate old single state if needed.
	 * @param {string} channelId
	 */
	async ensureFwBuryPointRoot(channelId) {
		const rootId = `${channelId}.fwBuryPoint`;
		const existing = await this.getObjectAsync(rootId);
		if (existing && existing.type === 'state') {
			this.log.info(`Migrating ${rootId} from state to folder structure`);
			await this.delObjectAsync(rootId);
		}

		await this.ensureObjectType(rootId, 'folder', {
			name: 'FwBuryPoint',
			desc: 'Firmware bury point telemetry',
		}, {});

		await this.ensureObjectType(`${rootId}.raw`, 'state', {
			name: 'Raw FW Bury Point',
			type: 'string',
			role: 'json',
			read: true,
			write: false,
		}, {});
	}

	/**
	 * Normalize fwBuryPoint substate name, removing the bd_ prefix.
	 * @param {string} substate
	 * @returns {string}
	 */
	normalizeFwBuryPointSubstate(substate) {
		const cleaned = String(substate || '').trim().replace(/^bd_/i, '');
		return cleaned.replace(/[^a-zA-Z0-9_-]/g, '_');
	}

	/**
	 * Normalize a fwBuryPoint data field key for ioBroker object IDs.
	 * @param {string} fieldKey
	 * @returns {string}
	 */
	normalizeFwBuryPointFieldKey(fieldKey) {
		return String(fieldKey || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
	}

	/**
	 * Process fwBuryPoint payload into dynamic sub-channels under devices.<serial>.fwBuryPoint.
	 * @param {string} channelId
	 * @param {any} fwBuryPoint
	 */
	async processFwBuryPointUpdate(channelId, fwBuryPoint) {
		if (fwBuryPoint === undefined || fwBuryPoint === null) {
			return;
		}

		await this.ensureFwBuryPointRoot(channelId);
		const rootId = `${channelId}.fwBuryPoint`;
		await this.setRawState(`${rootId}.raw`, typeof fwBuryPoint === 'string' ? fwBuryPoint : JSON.stringify(fwBuryPoint), true);

		if (!fwBuryPoint || typeof fwBuryPoint !== 'object') {
			return;
		}

		const substate = this.normalizeFwBuryPointSubstate(fwBuryPoint.substate);
		if (!substate) {
			return;
		}

		const subChannelId = `${rootId}.${substate}`;
		await this.ensureObjectType(subChannelId, 'channel', {
			name: substate,
			desc: `FW Bury Point ${substate}`,
		}, {});

		await this.ensureObjectType(`${subChannelId}.raw`, 'state', {
			name: 'Raw',
			type: 'string',
			role: 'json',
			read: true,
			write: false,
		}, {});

		const subPayload = fwBuryPoint.data !== undefined ? fwBuryPoint.data : fwBuryPoint;
		await this.setRawState(`${subChannelId}.raw`, typeof subPayload === 'string' ? subPayload : JSON.stringify(subPayload), true);

		if (!subPayload || typeof subPayload !== 'object' || Array.isArray(subPayload)) {
			return;
		}

		for (const [fieldKey, fieldValue] of Object.entries(subPayload)) {
			const normalizedFieldKey = this.normalizeFwBuryPointFieldKey(fieldKey);
			if (!normalizedFieldKey || fieldValue === undefined) {
				continue;
			}

			const isComplex = fieldValue === null || typeof fieldValue === 'object';
			const stateId = `${subChannelId}.${normalizedFieldKey}`;
			const stateType = isComplex
				? 'string'
				: (typeof fieldValue === 'boolean' ? 'boolean' : (typeof fieldValue === 'number' ? 'number' : 'string'));
			const isVoltage = !isComplex && typeof fieldValue === 'number' && /voltage/i.test(fieldKey);
			const stateRole = isComplex
				? 'json'
				: (typeof fieldValue === 'boolean' ? 'indicator' : (isVoltage ? 'value.voltage' : (typeof fieldValue === 'number' ? 'value' : 'text')));
			const stateUnit = isVoltage ? 'mV' : undefined;

			const stateCommon = {
				name: fieldKey,
				type: stateType,
				role: stateRole,
				read: true,
				write: false,
			};
			if (stateUnit) {
				stateCommon.unit = stateUnit;
			}

			await this.ensureObjectType(stateId, 'state', stateCommon, {});

			if (stateType === 'number') {
				const numericValue = Number(fieldValue);
				if (Number.isFinite(numericValue)) {
					await this.setState(stateId, numericValue, true);
				}
			} else if (stateType === 'boolean') {
				await this.setState(stateId, Boolean(fieldValue), true);
			} else {
				await this.setState(stateId, isComplex ? JSON.stringify(fieldValue) : String(fieldValue), true);
			}
		}
	}

	/**
	 * Ensure settings root folder.
	 * @param {string} channelId
	 */
	async ensureSettingsRoot(channelId) {
		await this.ensureObjectType(`${channelId}.settings`, 'folder', {
			name: 'Settings',
			desc: 'Lazy-loaded device configuration fields',
		}, {});
	}

	/**
	 * Normalize settings sub-field key for ioBroker object IDs.
	 * @param {string} fieldKey
	 * @returns {string}
	 */
	normalizeSettingFieldKey(fieldKey) {
		return String(fieldKey || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
	}

	/**
	 * Convert known boolean-like setting fields.
	 * @param {string} key
	 * @param {any} value
	 * @returns {boolean | null}
	 */
	parseSettingBooleanValue(key, value) {
		if (key !== 'enable') {
			return null;
		}
		if (typeof value === 'boolean') {
			return value;
		}
		if (typeof value === 'number') {
			if (value === 1) return true;
			if (value === 0) return false;
		}
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (normalized === '1' || normalized === 'true') return true;
			if (normalized === '0' || normalized === 'false') return false;
		}
		return null;
	}

	/**
	 * Return optional states mapping for known settings fields.
	 * @param {string} fieldName
	 * @param {string} key
	 * @returns {Record<string, string> | null}
	 */
	getSettingStatesMapping(fieldName, key) {
		if (key !== 'level') {
			return null;
		}

		if (fieldName === 'cutEfficiency') {
			return {
				'1': 'Effizient (0,5m/s)',
				'2': 'Fein (0,35 m/s)',
			};
		}

		if (fieldName === 'obstacleHeight') {
			return {
				'1': 'Flacher Untergrund (>10cm)',
				'2': 'Normale Umgebung (>15cm)',
				'3': 'Hohes Gras (>20cm)',
			};
		}

		return null;
	}

	/**
	 * Process one lazy-loaded settings field into channel/raw/parsed substates.
	 * @param {string} channelId
	 * @param {string} fieldName
	 * @param {any} fieldValue
	 */
	async processSettingsFieldUpdate(channelId, fieldName, fieldValue) {
		if (fieldValue === undefined || fieldValue === null) {
			return;
		}

		await this.ensureSettingsRoot(channelId);
		const settingChannelId = `${channelId}.settings.${fieldName}`;
		const existing = await this.getObjectAsync(settingChannelId);
		if (existing && existing.type === 'state') {
			this.log.info(`Migrating ${settingChannelId} from state to channel`);
			await this.delObjectAsync(settingChannelId);
		}

		await this.ensureObjectType(settingChannelId, 'channel', {
			name: fieldName,
			desc: `Setting ${fieldName}`,
		}, {});

		await this.ensureObjectType(`${settingChannelId}.raw`, 'state', {
			name: 'Raw',
			type: 'string',
			role: 'json',
			read: true,
			write: false,
		}, {});

		await this.setRawState(`${settingChannelId}.raw`, typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue), true);

		if (!fieldValue || typeof fieldValue !== 'object' || Array.isArray(fieldValue)) {
			return;
		}

		for (const [key, value] of Object.entries(fieldValue)) {
			const normalizedKey = this.normalizeSettingFieldKey(key);
			if (!normalizedKey || value === undefined) {
				continue;
			}

			const boolValue = this.parseSettingBooleanValue(key, value);
			const isComplex = value !== null && typeof value === 'object';
			const stateId = `${settingChannelId}.${normalizedKey}`;
			const statesMapping = this.getSettingStatesMapping(fieldName, key);
			const stateType = boolValue !== null
				? 'boolean'
				: (isComplex ? 'string' : (typeof value === 'number' ? 'number' : 'string'));
			const stateRole = boolValue !== null
				? 'indicator'
				: (isComplex ? 'json' : (typeof value === 'number' ? 'value' : 'text'));
			const stateCommon = {
				name: key,
				type: stateType,
				role: stateRole,
				read: true,
				write: false,
			};
			if (statesMapping) {
				stateCommon.states = statesMapping;
			}
			await this.ensureObjectType(stateId, 'state', stateCommon, {});
			if (statesMapping) {
				await this.extendObjectAsync(stateId, { common: { states: statesMapping } });
			}

			if (boolValue !== null) {
				await this.setState(stateId, boolValue, true);
			} else if (stateType === 'number') {
				const numericValue = Number(value);
				if (Number.isFinite(numericValue)) {
					await this.setState(stateId, numericValue, true);
				}
			} else {
				await this.setState(stateId, isComplex ? JSON.stringify(value) : String(value), true);
			}
		}
	}

	/**
	 * Normalize area parameters payload to a plain array.
	 * Library updates can arrive as array, object wrapper (body.data/data), or JSON string.
	 * @param {any} payload
	 * @returns {Array<Object>}
	 */
	normalizeAreaParameters(payload) {
		if (Array.isArray(payload)) {
			return payload;
		}

		if (typeof payload === 'string') {
			try {
				const parsed = JSON.parse(payload);
				return this.normalizeAreaParameters(parsed);
			} catch {
				return [];
			}
		}

		if (!payload || typeof payload !== 'object') {
			return [];
		}

		if (Array.isArray(payload.areaParameters)) {
			return payload.areaParameters;
		}
		if (Array.isArray(payload.areaParameter)) {
			return payload.areaParameter;
		}
		if (Array.isArray(payload.data)) {
			return payload.data;
		}
		if (payload.body && Array.isArray(payload.body.data)) {
			return payload.body.data;
		}

		return [];
	}

	/**
	 * Initialize connection to external ECOVACS library
	 */
	async initializeConnection() {
		try {
			if (!this.ecovacsClient) {
				throw new Error('ECOVACS client not initialized');
			}

			// API V2 connection is initiated in performDeviceDiscovery
			// This stub remains for backward compatibility
			this.log.debug('Connection will be initialized during device discovery');
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
			if (!this.ecovacsClient) {
				this.log.debug('ECOVACS client not initialized');
				return;
			}

			this.log.debug('Performing device discovery (API V2)...');

			// Connect to cloud
			const connected = await this.ecovacsClient.connect();
			if (!connected) {
				this.log.error('Failed to connect to ECOVACS cloud');
				await this.setState('info.connection', false, true);
				this.isConnected = false;
				return;
			}

			this.isConnected = true;
			await this.setState('info.connection', true, true);
			this.log.info('Connected to ECOVACS cloud');

			// Get all devices
			const discoveredDevices = await this.ecovacsClient.getDevices();
			this.log.info(`Device discovery returned ${discoveredDevices.length} device(s)`);
			
			if (discoveredDevices.length > 0) {
				this.log.debug(`Discovered devices: ${discoveredDevices.map(d => `${d.name || d.id}`).join(', ')}`);
				await this.processDiscoveredDevices(discoveredDevices);
			} else {
				this.log.warn('No GOAT devices discovered. Check your ECOVACS account and credentials.');
			}

			this.log.debug('Device discovery completed');
		} catch (error) {
			this.log.error(`Device discovery failed: ${error.message}`);
			this.log.debug(`Discovery error details: ${error.stack}`);
			await this.setState('info.connection', false, true);
			this.isConnected = false;
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
				const mowCommand = device.mowCommand && typeof device.mowCommand === 'object' ? device.mowCommand : null;
				const lifeSpan = device.lifeSpan && typeof device.lifeSpan === 'object' ? device.lifeSpan : {};
				const totalStats = device.totalStats && typeof device.totalStats === 'object' ? device.totalStats : {};
				const stats = device.stats && typeof device.stats === 'object' ? device.stats : {};
				const lastTimeStats = device.lastTimeStats && typeof device.lastTimeStats === 'object' ? device.lastTimeStats : {};
				const protectState = device.protectState;
				const areaSet = device.areaSet;
				const fwBuryPoint = device.fwBuryPoint;
				const areaParameters = this.normalizeAreaParameters(device.areaParameters || device.areaParameter);
				const chargeState = device.chargeState && typeof device.chargeState === 'object' ? device.chargeState : {};
				const netInfo = device.netInfo && typeof device.netInfo === 'object' ? device.netInfo : {};
				const volume = device.volume && typeof device.volume === 'object' ? device.volume : {};
				const sleep = device.sleep;
				const errorState = device.error;
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

				// Charging as channel with isCharging/mode states
				await this.ensureObjectType(`${channelId}.charging`, 'channel', {
					name: 'Charging',
					desc: 'Charging state information',
				}, {});

				await this.ensureObjectType(`${channelId}.charging.isCharging`, 'state', {
					name: 'Is Charging',
					type: 'boolean',
					role: 'indicator.charging',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.charging.mode`, 'state', {
					name: 'Charging Mode',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.charging.raw`, 'state', {
					name: 'Charge Info Raw',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				// MapState
				await this.ensureObjectType(`${channelId}.mapState`, 'channel', {
					name: 'Map State',
					desc: 'Map display state',
				}, {});
				await this.ensureObjectType(`${channelId}.mapState.state`, 'state', {
					name: 'State',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.mapState.expandState`, 'state', {
					name: 'Expand State',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				// Geolocation
				await this.ensureObjectType(`${channelId}.geolocation`, 'channel', {
					name: 'Geolocation',
					desc: 'Device GPS position',
				}, {});
				await this.ensureObjectType(`${channelId}.geolocation.latitude`, 'state', {
					name: 'Latitude',
					type: 'number',
					role: 'value.gps.latitude',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.geolocation.longitude`, 'state', {
					name: 'Longitude',
					type: 'number',
					role: 'value.gps.longitude',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.geolocation.enable`, 'state', {
					name: 'Enabled',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});

				// Info fields (lazy-loaded via getInfo)
				await this.ensureSettingsRoot(channelId);

				// NetInfo as channel with network states
				await this.ensureObjectType(`${channelId}.netInfo`, 'channel', {
					name: 'Network Info',
					desc: 'Device network information',
				}, {});

				await this.ensureObjectType(`${channelId}.netInfo.ip`, 'state', {
					name: 'IP Address',
					type: 'string',
					role: 'info.ip',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.netInfo.ssid`, 'state', {
					name: 'SSID',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.netInfo.rssi`, 'state', {
					name: 'RSSI',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.netInfo.wkVer`, 'state', {
					name: 'Firmware Version',
					type: 'string',
					role: 'info.firmware',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.netInfo.mac`, 'state', {
					name: 'MAC Address',
					type: 'string',
					role: 'info.mac',
					read: true,
					write: false,
				}, {});

				// Volume as channel with volume/fallVolume/searchVolume states
				await this.ensureObjectType(`${channelId}.volume`, 'channel', {
					name: 'Volume',
					desc: 'Device volume settings',
				}, {});

				await this.ensureObjectType(`${channelId}.volume.volume`, 'state', {
					name: 'Volume',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.volume.fallVolume`, 'state', {
					name: 'Fall Volume',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.volume.searchVolume`, 'state', {
					name: 'Search Volume',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});

				// Sleep and Error as direct states (without channels)
				await this.ensureObjectType(`${channelId}.sleep`, 'state', {
					name: 'Sleep',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.error`, 'state', {
					name: 'Error',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
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

				await this.ensureObjectType(`${channelId}.mowInfo.cleanStateRaw`, 'state', {
					name: 'Clean State Raw',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowState`, 'state', {
					name: 'Mow State',
					type: 'string',
					role: 'info.status',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowCommand`, 'channel', {
					name: 'Mow Command',
					desc: 'Last mow command payload',
				}, {});

				await this.ensureObjectType(`${channelId}.mowCommand.act`, 'state', {
					name: 'Action',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowCommand.type`, 'state', {
					name: 'Type',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowCommand.value`, 'state', {
					name: 'Value',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowCommand.ts`, 'state', {
					name: 'Timestamp',
					type: 'number',
					role: 'value.time',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowCommand.parsedRaw`, 'state', {
					name: 'Parsed Raw',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.mowCommand.raw`, 'state', {
					name: 'Raw Command',
					type: 'string',
					role: 'json',
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

				// Additional library hooks are stored as raw JSON until their schema is stabilized
				await this.ensureObjectType(`${channelId}.stats`, 'channel', {
					name: 'Stats',
					desc: 'Raw stats payload',
				}, {});
				await this.ensureObjectType(`${channelId}.stats.time`, 'state', {
					name: 'Time',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.stats.area`, 'state', {
					name: 'Area',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.stats.mowedArea`, 'state', {
					name: 'Mowed Area',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.stats.raw`, 'state', {
					name: 'Raw Stats',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.lastTimeStats`, 'channel', {
					name: 'Last Time Stats',
					desc: 'Raw last time stats payload',
				}, {});
				await this.ensureObjectType(`${channelId}.lastTimeStats.raw`, 'state', {
					name: 'Raw Last Time Stats',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.protectState`, 'channel', {
					name: 'Protect State',
					desc: 'Raw protect state payload',
				}, {});
				await this.ensureObjectType(`${channelId}.protectState.isAnimProtect`, 'state', {
					name: 'Animation Protect',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.protectState.isRainProtect`, 'state', {
					name: 'Rain Protect',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.protectState.isRainDelay`, 'state', {
					name: 'Rain Delay',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.protectState.isEStop`, 'state', {
					name: 'Emergency Stop',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.protectState.isLocked`, 'state', {
					name: 'Locked',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.protectState.isPinCode`, 'state', {
					name: 'Pin Code Enabled',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.protectState.isPrepareDataSuccess`, 'state', {
					name: 'Prepare Data Success',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
				}, {});
				await this.ensureObjectType(`${channelId}.protectState.raw`, 'state', {
					name: 'Raw Protect State',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				await this.ensureObjectType(`${channelId}.areaSet`, 'state', {
					name: 'Area Set',
					type: 'string',
					role: 'json',
					read: true,
					write: false,
				}, {});

				await this.ensureFwBuryPointRoot(channelId);

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
				if (Object.prototype.hasOwnProperty.call(chargeState, 'isCharging')) {
					const isChargingValue = chargeState.isCharging;
					const isCharging = isChargingValue === true || isChargingValue === 1 || isChargingValue === '1';
					await this.setState(`${channelId}.charging.isCharging`, isCharging, true);
				} else if (device.isCharging !== undefined && device.isCharging !== null) {
					const isCharging = device.isCharging === true || device.isCharging === 1 || device.isCharging === '1';
					await this.setState(`${channelId}.charging.isCharging`, isCharging, true);
				}
				if (Object.prototype.hasOwnProperty.call(chargeState, 'mode')) {
					await this.setState(`${channelId}.charging.mode`, chargeState.mode != null ? String(chargeState.mode) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(netInfo, 'ip')) {
					await this.setState(`${channelId}.netInfo.ip`, netInfo.ip != null ? String(netInfo.ip) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(netInfo, 'ssid')) {
					await this.setState(`${channelId}.netInfo.ssid`, netInfo.ssid != null ? String(netInfo.ssid) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(netInfo, 'rssi')) {
					const rssi = Number(netInfo.rssi);
					if (Number.isFinite(rssi)) {
						await this.setState(`${channelId}.netInfo.rssi`, rssi, true);
					}
				}
				if (Object.prototype.hasOwnProperty.call(netInfo, 'wkVer')) {
					await this.setState(`${channelId}.netInfo.wkVer`, netInfo.wkVer != null ? String(netInfo.wkVer) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(netInfo, 'mac')) {
					await this.setState(`${channelId}.netInfo.mac`, netInfo.mac != null ? String(netInfo.mac) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(volume, 'volume')) {
					const volumeValue = Number(volume.volume);
					if (Number.isFinite(volumeValue)) {
						await this.setState(`${channelId}.volume.volume`, volumeValue, true);
					}
				}
				if (Object.prototype.hasOwnProperty.call(volume, 'fallVolume')) {
					const fallVolume = Number(volume.fallVolume);
					if (Number.isFinite(fallVolume)) {
						await this.setState(`${channelId}.volume.fallVolume`, fallVolume, true);
					}
				}
				if (Object.prototype.hasOwnProperty.call(volume, 'searchVolume')) {
					const searchVolume = Number(volume.searchVolume);
					if (Number.isFinite(searchVolume)) {
						await this.setState(`${channelId}.volume.searchVolume`, searchVolume, true);
					}
				}
				if (sleep !== undefined && sleep !== null) {
					const sleepValue = sleep === true || sleep === 1 || sleep === '1';
					await this.setState(`${channelId}.sleep`, sleepValue, true);
				}
				if (errorState !== undefined && errorState !== null) {
					const errorText = typeof errorState === 'string' ? errorState : JSON.stringify(errorState);
					await this.setState(`${channelId}.error`, errorText, true);
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
					await this.setState(`${channelId}.mowState`, mowInfo.state != null ? String(mowInfo.state) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(mowInfo, 'type')) {
					await this.setState(`${channelId}.mowInfo.type`, mowInfo.type != null ? String(mowInfo.type) : '', true);
				}
				if (Object.prototype.hasOwnProperty.call(mowInfo, 'cleanState') && mowInfo.cleanState !== undefined) {
					await this.setRawState(`${channelId}.mowInfo.cleanStateRaw`, mowInfo.cleanState == null ? '' : JSON.stringify(mowInfo.cleanState), true);
				}
				if (mowCommand) {
					if (Object.prototype.hasOwnProperty.call(mowCommand, 'act')) {
						await this.setState(`${channelId}.mowCommand.act`, mowCommand.act != null ? String(mowCommand.act) : '', true);
					}
					if (Object.prototype.hasOwnProperty.call(mowCommand, 'type')) {
						await this.setState(`${channelId}.mowCommand.type`, mowCommand.type != null ? String(mowCommand.type) : '', true);
					}
					if (Object.prototype.hasOwnProperty.call(mowCommand, 'value')) {
						await this.setState(`${channelId}.mowCommand.value`, mowCommand.value != null ? String(mowCommand.value) : '', true);
					}
					if (Object.prototype.hasOwnProperty.call(mowCommand, 'ts') && Number.isFinite(Number(mowCommand.ts))) {
						await this.setState(`${channelId}.mowCommand.ts`, Number(mowCommand.ts), true);
					}
					if (Object.prototype.hasOwnProperty.call(mowCommand, 'parsed') && mowCommand.parsed !== undefined) {
						await this.setRawState(`${channelId}.mowCommand.parsedRaw`, mowCommand.parsed == null ? '' : JSON.stringify(mowCommand.parsed), true);
					}
					await this.setRawState(`${channelId}.mowCommand.raw`, JSON.stringify(mowCommand), true);
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
					await this.setRawState(`${channelId}.totalStats.raw`, JSON.stringify(totalStats), true);
				}
				if (Object.keys(stats).length > 0) {
					const statsData = stats.body && typeof stats.body === 'object' && stats.body.data && typeof stats.body.data === 'object'
						? stats.body.data
						: stats;
					if (Object.prototype.hasOwnProperty.call(statsData, 'time') && Number.isFinite(Number(statsData.time))) {
						await this.setState(`${channelId}.stats.time`, Number(statsData.time), true);
					}
					if (Object.prototype.hasOwnProperty.call(statsData, 'area') && Number.isFinite(Number(statsData.area))) {
						await this.setState(`${channelId}.stats.area`, Number(statsData.area), true);
					}
					if (Object.prototype.hasOwnProperty.call(statsData, 'mowedArea') && Number.isFinite(Number(statsData.mowedArea))) {
						await this.setState(`${channelId}.stats.mowedArea`, Number(statsData.mowedArea), true);
					}
					await this.setRawState(`${channelId}.stats.raw`, JSON.stringify(stats), true);
				}
				if (Object.keys(lastTimeStats).length > 0) {
					await this.setRawState(`${channelId}.lastTimeStats.raw`, JSON.stringify(lastTimeStats), true);
				}
				if (protectState !== undefined && protectState !== null) {
					const protectData = protectState.body && typeof protectState.body === 'object' && protectState.body.data && typeof protectState.body.data === 'object'
						? protectState.body.data
						: protectState;
					if (protectData && typeof protectData === 'object') {
						for (const key of ['isAnimProtect', 'isRainProtect', 'isRainDelay', 'isEStop', 'isLocked', 'isPinCode', 'isPrepareDataSuccess']) {
							if (Object.prototype.hasOwnProperty.call(protectData, key)) {
								const value = protectData[key] === true || protectData[key] === 1 || protectData[key] === '1';
								await this.setState(`${channelId}.protectState.${key}`, value, true);
							}
						}
					}
					await this.setRawState(`${channelId}.protectState.raw`, typeof protectState === 'string' ? protectState : JSON.stringify(protectState), true);
				}
				
				// Set areaSet raw JSON
				if (areaSet !== undefined && areaSet !== null) {
					await this.setRawState(`${channelId}.areaSet`, typeof areaSet === 'string' ? areaSet : JSON.stringify(areaSet), true);
				}

				await this.processFwBuryPointUpdate(channelId, fwBuryPoint);

				// Ensure area structure based on areaParameters
				if (areaParameters !== undefined && areaParameters !== null) {
					if (areaParameters.length > 0) {
						await this.ensureAreaStructure(channelId, areaParameters);
					} else {
						this.log.debug(`No usable areaParameters for ${channelId}`);
					}
				}

				this.devices[channelKey] = device;

			// Setup realtime callbacks using the API V2 device reference
			if (this.ecovacsClient && device.api2Device) {
				await this.ecovacsClient.setupDeviceCallbacks(device.api2Device, channelKey, this.handleRealtimeDeviceUpdate.bind(this));

				// Get initial state snapshot
				const snapshot = await this.ecovacsClient.getInitialSnapshot(device.api2Device);
				if (Object.keys(snapshot).length > 0) {
					await this.handleRealtimeDeviceUpdate(channelKey, snapshot);
				}
			} else if (this.ecovacsClient && !device.api2Device) {
				this.log.warn(`Device ${channelKey} missing api2Device reference`);
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
					await this.setState(`${channelId}.mowState`, mowInfo.state != null ? String(mowInfo.state) : '', true);
				}
				if (mowInfo && Object.prototype.hasOwnProperty.call(mowInfo, 'type')) {
					await this.setState(`${channelId}.mowInfo.type`, mowInfo.type != null ? String(mowInfo.type) : '', true);
				}
				if (mowInfo && Object.prototype.hasOwnProperty.call(mowInfo, 'cleanState')) {
					await this.setRawState(`${channelId}.mowInfo.cleanStateRaw`, mowInfo.cleanState == null ? '' : JSON.stringify(mowInfo.cleanState), true);
				}
			}

			if (update.mowCommand !== undefined) {
				const mowCommand = update.mowCommand && typeof update.mowCommand === 'object' ? update.mowCommand : null;
				if (mowCommand && Object.prototype.hasOwnProperty.call(mowCommand, 'act')) {
					await this.setState(`${channelId}.mowCommand.act`, mowCommand.act != null ? String(mowCommand.act) : '', true);
				}
				if (mowCommand && Object.prototype.hasOwnProperty.call(mowCommand, 'type')) {
					await this.setState(`${channelId}.mowCommand.type`, mowCommand.type != null ? String(mowCommand.type) : '', true);
				}
				if (mowCommand && Object.prototype.hasOwnProperty.call(mowCommand, 'value')) {
					await this.setState(`${channelId}.mowCommand.value`, mowCommand.value != null ? String(mowCommand.value) : '', true);
				}
				if (mowCommand && Object.prototype.hasOwnProperty.call(mowCommand, 'ts')) {
					const ts = Number(mowCommand.ts);
					if (Number.isFinite(ts)) {
						await this.setState(`${channelId}.mowCommand.ts`, ts, true);
					}
				}
				if (mowCommand && Object.prototype.hasOwnProperty.call(mowCommand, 'parsed')) {
					await this.setRawState(`${channelId}.mowCommand.parsedRaw`, mowCommand.parsed == null ? '' : JSON.stringify(mowCommand.parsed), true);
				}
				if (mowCommand) {
					await this.setRawState(`${channelId}.mowCommand.raw`, JSON.stringify(mowCommand), true);
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
					await this.setRawState(`${channelId}.totalStats.raw`, JSON.stringify(totalStats), true);
				}
			}

			if (update.stats !== undefined) {
				const stats = update.stats;
				if (stats !== null && stats !== undefined) {
					const statsData = stats && typeof stats === 'object' && stats.body && typeof stats.body === 'object' && stats.body.data && typeof stats.body.data === 'object'
						? stats.body.data
						: stats;
					if (statsData && typeof statsData === 'object') {
						if (Object.prototype.hasOwnProperty.call(statsData, 'time') && Number.isFinite(Number(statsData.time))) {
							await this.setState(`${channelId}.stats.time`, Number(statsData.time), true);
						}
						if (Object.prototype.hasOwnProperty.call(statsData, 'area') && Number.isFinite(Number(statsData.area))) {
							await this.setState(`${channelId}.stats.area`, Number(statsData.area), true);
						}
						if (Object.prototype.hasOwnProperty.call(statsData, 'mowedArea') && Number.isFinite(Number(statsData.mowedArea))) {
							await this.setState(`${channelId}.stats.mowedArea`, Number(statsData.mowedArea), true);
						}
					}
					await this.setRawState(`${channelId}.stats.raw`, typeof stats === 'string' ? stats : JSON.stringify(stats), true);
				}
			}

			if (update.lastTimeStats !== undefined) {
				const lastTimeStats = update.lastTimeStats;
				if (lastTimeStats !== null && lastTimeStats !== undefined) {
					await this.setRawState(`${channelId}.lastTimeStats.raw`, typeof lastTimeStats === 'string' ? lastTimeStats : JSON.stringify(lastTimeStats), true);
				}
			}

			if (update.protectState !== undefined) {
				const protectState = update.protectState;
				if (protectState !== null && protectState !== undefined) {
					const protectData = protectState && typeof protectState === 'object' && protectState.body && typeof protectState.body === 'object' && protectState.body.data && typeof protectState.body.data === 'object'
						? protectState.body.data
						: protectState;
					if (protectData && typeof protectData === 'object') {
						for (const key of ['isAnimProtect', 'isRainProtect', 'isRainDelay', 'isEStop', 'isLocked', 'isPinCode', 'isPrepareDataSuccess']) {
							if (Object.prototype.hasOwnProperty.call(protectData, key)) {
								const value = protectData[key] === true || protectData[key] === 1 || protectData[key] === '1';
								await this.setState(`${channelId}.protectState.${key}`, value, true);
							}
						}
					}
					await this.setRawState(`${channelId}.protectState.raw`, typeof protectState === 'string' ? protectState : JSON.stringify(protectState), true);
				}
			}

			if (update.areaSet !== undefined) {
				const areaSet = update.areaSet;
				if (areaSet !== null && areaSet !== undefined) {
					await this.setRawState(`${channelId}.areaSet`, typeof areaSet === 'string' ? areaSet : JSON.stringify(areaSet), true);
				}
			}

			if (update.fwBuryPoint !== undefined) {
				const fwBuryPoint = update.fwBuryPoint;
				await this.processFwBuryPointUpdate(channelId, fwBuryPoint);
			}

			if (update.areaParameters !== undefined || update.areaParameter !== undefined) {
				const areaParameters = this.normalizeAreaParameters(update.areaParameters || update.areaParameter);
				if (areaParameters.length > 0) {
					await this.ensureAreaStructure(channelId, areaParameters);
				} else {
					const rawPayload = update.areaParameters !== undefined ? update.areaParameters : update.areaParameter;
					this.log.debug(`Ignoring unusable areaParameters update for ${channelId}: ${typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload)}`);
				}
			}


			if (update.chargeState !== undefined) {
				const chargeState = update.chargeState && typeof update.chargeState === 'object' ? update.chargeState : null;
				if (chargeState && Object.prototype.hasOwnProperty.call(chargeState, 'isCharging')) {
					const isChargingValue = chargeState.isCharging;
					const isCharging = isChargingValue === true || isChargingValue === 1 || isChargingValue === '1';
					await this.setState(`${channelId}.charging.isCharging`, isCharging, true);
				}
				if (chargeState && Object.prototype.hasOwnProperty.call(chargeState, 'mode')) {
					await this.setState(`${channelId}.charging.mode`, chargeState.mode != null ? String(chargeState.mode) : '', true);
				}
			}

			if (update.chargeInfo !== undefined && update.chargeInfo !== null) {
				await this.setRawState(`${channelId}.charging.raw`, typeof update.chargeInfo === 'string' ? update.chargeInfo : JSON.stringify(update.chargeInfo), true);
			}

			if (update.mapState !== undefined && update.mapState !== null) {
				const mapState = update.mapState;
				if (mapState && typeof mapState === 'object') {
					if (mapState.state != null) {
						await this.setState(`${channelId}.mapState.state`, String(mapState.state), true);
					}
					if (mapState.expandState != null) {
						await this.setState(`${channelId}.mapState.expandState`, String(mapState.expandState), true);
					}
				}
			}

			if (update.geolocation !== undefined && update.geolocation !== null) {
				const geo = update.geolocation;
				if (geo && geo.geoLocation) {
					const lat = Number(geo.geoLocation.latitude);
					const lon = Number(geo.geoLocation.longitude);
					if (Number.isFinite(lat)) await this.setState(`${channelId}.geolocation.latitude`, lat, true);
					if (Number.isFinite(lon)) await this.setState(`${channelId}.geolocation.longitude`, lon, true);
				}
				if (geo && geo.enable !== undefined) {
					await this.setState(`${channelId}.geolocation.enable`, Boolean(geo.enable), true);
				}
			}

			// Info fields (lazy-loaded)
			for (const infoField of ['cutEfficiency', 'obstacleHeight', 'cutHeight', 'cutDirection', 'autoCutDirection', 'rainDelay', 'animProtect', 'timeZone', 'customCutMode', 'borderSwitch']) {
				if (update[infoField] !== undefined && update[infoField] !== null) {
					await this.processSettingsFieldUpdate(channelId, infoField, update[infoField]);
				}
			}

			if (update.netInfo !== undefined) {
				const netInfo = update.netInfo && typeof update.netInfo === 'object' ? update.netInfo : null;
				if (netInfo && Object.prototype.hasOwnProperty.call(netInfo, 'ip')) {
					await this.setState(`${channelId}.netInfo.ip`, netInfo.ip != null ? String(netInfo.ip) : '', true);
				}
				if (netInfo && Object.prototype.hasOwnProperty.call(netInfo, 'ssid')) {
					await this.setState(`${channelId}.netInfo.ssid`, netInfo.ssid != null ? String(netInfo.ssid) : '', true);
				}
				if (netInfo && Object.prototype.hasOwnProperty.call(netInfo, 'rssi')) {
					const rssi = Number(netInfo.rssi);
					if (Number.isFinite(rssi)) {
						await this.setState(`${channelId}.netInfo.rssi`, rssi, true);
					}
				}
				if (netInfo && Object.prototype.hasOwnProperty.call(netInfo, 'wkVer')) {
					await this.setState(`${channelId}.netInfo.wkVer`, netInfo.wkVer != null ? String(netInfo.wkVer) : '', true);
				}
				if (netInfo && Object.prototype.hasOwnProperty.call(netInfo, 'mac')) {
					await this.setState(`${channelId}.netInfo.mac`, netInfo.mac != null ? String(netInfo.mac) : '', true);
				}
			}

			if (update.volume !== undefined) {
				const volume = update.volume && typeof update.volume === 'object' ? update.volume : null;
				if (volume && Object.prototype.hasOwnProperty.call(volume, 'volume')) {
					const volumeValue = Number(volume.volume);
					if (Number.isFinite(volumeValue)) {
						await this.setState(`${channelId}.volume.volume`, volumeValue, true);
					}
				}
				if (volume && Object.prototype.hasOwnProperty.call(volume, 'fallVolume')) {
					const fallVolume = Number(volume.fallVolume);
					if (Number.isFinite(fallVolume)) {
						await this.setState(`${channelId}.volume.fallVolume`, fallVolume, true);
					}
				}
				if (volume && Object.prototype.hasOwnProperty.call(volume, 'searchVolume')) {
					const searchVolume = Number(volume.searchVolume);
					if (Number.isFinite(searchVolume)) {
						await this.setState(`${channelId}.volume.searchVolume`, searchVolume, true);
					}
				}
			}

			if (update.sleep !== undefined && update.sleep !== null) {
				const sleepValue = update.sleep === true || update.sleep === 1 || update.sleep === '1';
				await this.setState(`${channelId}.sleep`, sleepValue, true);
			}

			if (update.error !== undefined && update.error !== null) {
				const errorText = typeof update.error === 'string' ? update.error : JSON.stringify(update.error);
				await this.setState(`${channelId}.error`, errorText, true);
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
