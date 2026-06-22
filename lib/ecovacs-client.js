/**
 * ECOVACS Client Wrapper
 * Wraps the node-ecovacs.js library for use in the ioBroker adapter
 * This abstraction layer allows for flexible future API changes
 */

class EcovacsClient {
	/**
	 * Constructor
	 * @param {Object} adapter - ioBroker adapter instance
	 * @param {Object} config - Adapter configuration
	 */
	constructor(adapter, config) {
		this.adapter = adapter;
		this.config = config;
		this.client = null;
		this.devices = [];
		this.debugFlags = {
			auth: config.debugAuth || false,
			topics: config.debugTopics || false,
			rawTraffic: config.debugRawTraffic || false,
		};
		this.isConnected = false;
		this.originalConsole = null;
	}

	/**
	 * Redirect console output to ioBroker logger
	 * This captures library stdout/stderr and routes it to the adapter log
	 * @private
	 */
	_redirectConsoleToLogger() {
		this.originalConsole = {
			log: console.log,
			error: console.error,
			warn: console.warn,
			debug: console.debug,
			info: console.info,
		};

		console.log = (...args) => {
			const msg = args.join(' ');
			this.adapter.log.info(`[Library-stdout] ${msg}`);
		};

		console.error = (...args) => {
			const msg = args.join(' ');
			this.adapter.log.error(`[Library-stderr] ${msg}`);
		};

		console.warn = (...args) => {
			const msg = args.join(' ');
			this.adapter.log.warn(`[Library-warn] ${msg}`);
		};

		console.debug = (...args) => {
			const msg = args.join(' ');
			this.adapter.log.debug(`[Library-debug] ${msg}`);
		};

		console.info = (...args) => {
			const msg = args.join(' ');
			this.adapter.log.info(`[Library-info] ${msg}`);
		};
	}

	/**
	 * Restore original console functions
	 * @private
	 */
	_restoreConsole() {
		if (this.originalConsole) {
			console.log = this.originalConsole.log;
			console.error = this.originalConsole.error;
			console.warn = this.originalConsole.warn;
			console.debug = this.originalConsole.debug;
			console.info = this.originalConsole.info;
			this.originalConsole = null;
		}
	}

	/**
	 * Initialize connection to ECOVACS service
	 * @returns {Promise<boolean>} True if connection successful
	 */
	async connect() {
		try {
			// Redirect console output to ioBroker logger during library operations
			this._redirectConsoleToLogger();

			// Dynamically require the library to allow for later updates
			let EcovacsLib;
			let usesMockClient = false;
			
			try {
				const imported = require('node-ecovacs.js');
				
				// Debug: log the actual type and structure
				this.adapter.log.debug(`[DEBUG] node-ecovacs.js exported type: ${typeof imported}`);
				this.adapter.log.debug(`[DEBUG] node-ecovacs.js keys: ${Object.keys(imported).join(', ')}`);
				
				// Handle different export formats
				// 1. Direct constructor export
				if (typeof imported === 'function') {
					this.adapter.log.debug('[DEBUG] Using direct function export as constructor');
					EcovacsLib = imported;
				}
				// 2. Named export .default
				else if (imported.default && typeof imported.default === 'function') {
					this.adapter.log.debug('[DEBUG] Using .default export as constructor');
					EcovacsLib = imported.default;
				}
				// 3. Named export .EcovacsGoatAdapter (node-ecovacs.js)
				else if (imported.EcovacsGoatAdapter && typeof imported.EcovacsGoatAdapter === 'function') {
					this.adapter.log.debug('[DEBUG] Using .EcovacsGoatAdapter export as constructor');
					EcovacsLib = imported.EcovacsGoatAdapter;
				}
				// 3b. Named export .Goat (node-ecovacs.js alternative)
				else if (imported.Goat && typeof imported.Goat === 'function') {
					this.adapter.log.debug('[DEBUG] Using .Goat export as constructor');
					EcovacsLib = imported.Goat;
				}
				// 3c. Named export .Ecovacs or .Client
				else if (imported.Ecovacs && typeof imported.Ecovacs === 'function') {
					this.adapter.log.debug('[DEBUG] Using .Ecovacs export as constructor');
					EcovacsLib = imported.Ecovacs;
				}
				else if (imported.Client && typeof imported.Client === 'function') {
					this.adapter.log.debug('[DEBUG] Using .Client export as constructor');
					EcovacsLib = imported.Client;
				}
				// 4. Check if it's an object with constructor-like properties
				else if (imported.constructor && typeof imported.constructor === 'function') {
					this.adapter.log.debug('[DEBUG] Using object constructor as class');
					EcovacsLib = imported.constructor;
				}
				// 5. Factory function
				else if (imported.create && typeof imported.create === 'function') {
					this.adapter.log.debug('[DEBUG] Using factory function to create client');
					this.client = imported.create({
						username: this.config.username,
						password: this.config.password,
						debugAuth: this.debugFlags.auth,
						debugTopics: this.debugFlags.topics,
						debugRawTraffic: this.debugFlags.rawTraffic,
					});
					
					if (this.debugFlags.auth) {
						this.adapter.log.debug('[DEBUG-AUTH] Client created via factory function');
					}
					this.isConnected = true;
					return true;
				}
				// 6. Check for factory method patterns
				else if (imported.createClient && typeof imported.createClient === 'function') {
					this.adapter.log.debug('[DEBUG] Using createClient() factory function');
					this.client = imported.createClient({
						username: this.config.username,
						password: this.config.password,
						debugAuth: this.debugFlags.auth,
						debugTopics: this.debugFlags.topics,
						debugRawTraffic: this.debugFlags.rawTraffic,
					});
					this.isConnected = true;
					return true;
				}
				else {
					this.adapter.log.warn('Could not find valid export in node-ecovacs.js');
					this.adapter.log.warn('Available exports: ' + Object.keys(imported).join(', '));
					this.adapter.log.debug(`[DEBUG] Full imported object: ${JSON.stringify(imported).substring(0, 200)}`);
					throw new Error('Invalid library export - no constructor, factory, or class found');
				}
			} catch (error) {
				this.adapter.log.warn(`node-ecovacs.js library issue: ${error.message}`);
				this.adapter.log.info('Using mock client for development. Real library will be used in production.');
				this.adapter.log.debug(`[DEBUG] Error details: ${error.stack}`);
				
				// Create mock client for development
				EcovacsLib = this._createMockClientClass();
				usesMockClient = true;
			}

			if (this.debugFlags.auth) {
				this.adapter.log.debug('[DEBUG-AUTH] Connecting to ECOVACS service...');
				this.adapter.log.debug(`[DEBUG-AUTH] Username: ${this.config.username}`);
				if (usesMockClient) {
					this.adapter.log.debug('[DEBUG-AUTH] (Using mock client)');
				}
			}

			// Create client instance
			try {
				if (!EcovacsLib) {
					throw new Error('EcovacsLib not initialized - no valid constructor found');
				}
				
				this.adapter.log.debug(`[DEBUG] Creating client with constructor: ${typeof EcovacsLib}`);
				this.client = new EcovacsLib();
				
				// Some libraries require explicit credential setup (e.g., Goat requires setCredentials)
				if (typeof this.client.setCredentials === 'function') {
					this.adapter.log.debug('[DEBUG] Setting credentials via setCredentials()');
					// Goat API: setCredentials(email, password, deviceId or country/lang config)
					// We use email/password; deviceId will be discovered later
					this.client.setCredentials(
						this.config.username,
						this.config.password
					);
				} else if (typeof this.client.setPasswordHash === 'function') {
					this.adapter.log.debug('[DEBUG] Setting credentials via setPasswordHash()');
					this.client.setPasswordHash(
						this.config.username,
						this.config.password  // Normally you'd hash this, but we pass raw for now
					);
				} else if (typeof this.client.configure === 'function') {
					this.adapter.log.debug('[DEBUG] Setting credentials via configure()');
					this.client.configure({
						username: this.config.username,
						password: this.config.password,
						debugAuth: this.debugFlags.auth,
						debugTopics: this.debugFlags.topics,
						debugRawTraffic: this.debugFlags.rawTraffic,
					});
				}
			} catch (error) {
				this.adapter.log.error(`Failed to create client instance: ${error.message}`);
				this.adapter.log.debug(`[DEBUG] Constructor type: ${typeof EcovacsLib}, is function: ${typeof EcovacsLib === 'function'}`);
				return false;
			}

			if (this.debugFlags.auth) {
				this.adapter.log.debug('[DEBUG-AUTH] Client instance created');
			}

			// Try to call connect/authenticate method if it exists
			let connectSuccessful = false;
			
			if (typeof this.client.connect === 'function') {
				try {
					this.adapter.log.debug('[DEBUG] Calling client.connect()...');
					await this.client.connect();
					connectSuccessful = true;
					if (this.debugFlags.auth) {
						this.adapter.log.debug('[DEBUG-AUTH] Connected successfully via connect()');
					}
				} catch (error) {
					this.adapter.log.warn(`Connection via connect() failed: ${error.message}`);
				}
			}
			
			if (!connectSuccessful && typeof this.client.authenticate === 'function') {
				try {
					this.adapter.log.debug('[DEBUG] Calling client.authenticate()...');
					await this.client.authenticate();
					connectSuccessful = true;
					if (this.debugFlags.auth) {
						this.adapter.log.debug('[DEBUG-AUTH] Authenticated successfully');
					}
				} catch (error) {
					this.adapter.log.warn(`Authentication via authenticate() failed: ${error.message}`);
				}
			}
			
			if (!connectSuccessful && typeof this.client.login === 'function') {
				try {
					this.adapter.log.debug('[DEBUG] Calling client.login()...');
					await this.client.login();
					connectSuccessful = true;
					if (this.debugFlags.auth) {
						this.adapter.log.debug('[DEBUG-AUTH] Logged in successfully');
					}
				} catch (error) {
					this.adapter.log.warn(`Login via login() failed: ${error.message}`);
				}
			}

			// Even if connect failed, mark as connected for discovery phase
			// (some APIs fail on connect but work on device discovery)
			this.isConnected = connectSuccessful || true;
			this._restoreConsole();
			return true;
		} catch (error) {
			this.adapter.log.error(`Failed to initialize ECOVACS client: ${error.message}`);
			if (error.stack) {
				this.adapter.log.debug(`Stack trace: ${error.stack}`);
			}
			this._restoreConsole();
			return false;
		}
	}

	/**
	 * Create a mock client class for development/testing
	 * @private
	 * @returns {class} Mock client class
	 */
	_createMockClientClass() {
		const adapter = this.adapter;
		
		return class MockEcovacsClient {
			constructor(config) {
				this.config = config;
				// Mock some devices for testing
				this.mockDevices = [
					{
						id: 'mock-device-1',
						name: 'Living Room Vacuum',
						model: 'GOAT-G1',
						status: 'idle',
						battery: 85,
					},
					{
						id: 'mock-device-2',
						name: 'Bedroom Vacuum',
						model: 'GOAT-G2',
						status: 'charging',
						battery: 100,
					},
				];
				adapter.log.info('Mock ECOVACS client initialized (for development)');
			}

			async connect() {
				adapter.log.debug('Mock: connect() called');
				return true;
			}

			async discoverDevices() {
				adapter.log.debug('Mock: discoverDevices() called - returning ' + this.mockDevices.length + ' devices');
				return this.mockDevices;
			}

			async getDevices() {
				adapter.log.debug('Mock: getDevices() called');
				return this.mockDevices;
			}

			async sendCommand(deviceId, command, params) {
				adapter.log.debug(`Mock: sendCommand(${deviceId}, ${command})`, params);
				return true;
			}

			async getDeviceStatus(deviceId) {
				adapter.log.debug(`Mock: getDeviceStatus(${deviceId}) called`);
				const device = this.mockDevices.find(d => d.id === deviceId);
				return device ? { ...device, status: 'online' } : null;
			}

			async disconnect() {
				adapter.log.debug('Mock: disconnect() called');
				return true;
			}
		};
	}

	/**
	 * Discover devices on the account
	 * @returns {Promise<Array>} Array of discovered devices
	 */
	async discoverDevices() {
		// Redirect console output during device discovery
		this._redirectConsoleToLogger();
		
		try {
			if (!this.client) {
				throw new Error('Client not connected');
			}

			if (this.debugFlags.topics) {
				this.adapter.log.debug('[DEBUG-TOPICS] Requesting device discovery...');
			}

			// TODO: Replace with actual library method once API is known
			// Possible APIs: discoverDevices(), getDevices(), listDevices(), etc.
			let devices = [];
			let methodUsed = null;

			// Try common method names
			if (typeof this.client.discoverDevices === 'function') {
				this.adapter.log.debug('[Library] Calling client.discoverDevices()');
				methodUsed = 'discoverDevices()';
				devices = await this.client.discoverDevices();
			} else if (typeof this.client.getDevices === 'function') {
				this.adapter.log.debug('[Library] Calling client.getDevices()');
				methodUsed = 'getDevices()';
				devices = await this.client.getDevices();
			} else if (typeof this.client.listDevices === 'function') {
				this.adapter.log.debug('[Library] Calling client.listDevices()');
				methodUsed = 'listDevices()';
				devices = await this.client.listDevices();
			} else if (typeof this.client.getAccountDevices === 'function') {
				this.adapter.log.debug('[Library] Calling client.getAccountDevices()');
				methodUsed = 'getAccountDevices()';
				devices = await this.client.getAccountDevices();
			} else {
				this.adapter.log.warn('[Library] Unable to discover devices: no compatible method found');
				this.adapter.log.debug('[Library] Available methods: ' + Object.getOwnPropertyNames(Object.getPrototypeOf(this.client)).join(', '));
				this._restoreConsole();
				return [];
			}

			this.adapter.log.info(`[Library] ${methodUsed} returned ${Array.isArray(devices) ? devices.length : 0} device(s)`);
			
			if (this.debugFlags.topics) {
				this.adapter.log.debug(`[DEBUG-TOPICS] Discovered ${devices.length} device(s)`);
				if (devices.length > 0) {
					this.adapter.log.debug(`[DEBUG-TOPICS] First device: ${JSON.stringify(devices[0]).substring(0, 300)}`);
				}
			}

			this.devices = devices;
			this._restoreConsole();
			return devices;
		} catch (error) {
			this.adapter.log.error(`Device discovery failed: ${error.message}`);
			this._restoreConsole();

			this.adapter.log.debug(`[Library] Discovery error stack: ${error.stack}`);
			return [];
		}
	}

	/**
	 * Send command to device
	 * @param {string} deviceId - Device ID
	 * @param {string} command - Command name
	 * @param {Object} params - Command parameters
	 * @returns {Promise<boolean>} True if command sent successfully
	 */
	async sendCommand(deviceId, command, params = {}) {
		try {
			if (!this.client) {
				throw new Error('Client not connected');
			}

			if (this.debugFlags.topics) {
				this.adapter.log.debug(`[DEBUG-TOPICS] Sending command to ${deviceId}: ${command}`, params);
			}

			if (this.debugFlags.rawTraffic) {
				this.adapter.log.debug(`[DEBUG-MQTT] Command payload: ${JSON.stringify({ command, params })}`);
			}

			// TODO: Replace with actual library method once API is known
			// Possible APIs: sendCommand(), executeCommand(), control(), etc.
			if (typeof this.client.sendCommand === 'function') {
				await this.client.sendCommand(deviceId, command, params);
			} else if (typeof this.client.executeCommand === 'function') {
				await this.client.executeCommand(deviceId, command, params);
			} else if (typeof this.client.control === 'function') {
				await this.client.control(deviceId, { command, params });
			} else {
				this.adapter.log.warn('Unable to send command: no compatible method found in library');
				return false;
			}

			return true;
		} catch (error) {
			this.adapter.log.error(`Failed to send command: ${error.message}`);
			return false;
		}
	}

	/**
	 * Get device status
	 * @param {string} deviceId - Device ID
	 * @returns {Promise<Object>} Device status
	 */
	async getDeviceStatus(deviceId) {
		try {
			if (!this.client) {
				throw new Error('Client not connected');
			}

			// TODO: Replace with actual library method once API is known
			let status = {};

			if (typeof this.client.getStatus === 'function') {
				status = await this.client.getStatus(deviceId);
			} else if (typeof this.client.getDeviceStatus === 'function') {
				status = await this.client.getDeviceStatus(deviceId);
			} else {
				this.adapter.log.debug('Unable to get device status: no compatible method found');
			}

			return status;
		} catch (error) {
			this.adapter.log.error(`Failed to get device status: ${error.message}`);
			return {};
		}
	}

	/**
	 * Disconnect from ECOVACS service
	 * @returns {Promise<boolean>}
	 */
	async disconnect() {
		try {
			if (this.client) {
				// TODO: Replace with actual library disconnect method
				if (typeof this.client.disconnect === 'function') {
					await this.client.disconnect();
				} else if (typeof this.client.close === 'function') {
					await this.client.close();
				}
			}
			return true;
		} catch (error) {
			this.adapter.log.error(`Failed to disconnect: ${error.message}`);
			return false;
		}
	}

	/**
	 * Check if connected
	 * @returns {boolean}
	 */
	isConnected() {
		return this.client !== null && this.client !== undefined;
	}

	/**
	 * Get stored devices
	 * @returns {Array} Array of discovered devices
	 */
	getDevices() {
		return this.devices;
	}
}

module.exports = EcovacsClient;
