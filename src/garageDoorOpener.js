const packageJson = require('../package.json');
const HttpClient = require('./httpClient');
const WebhookServer = require('./webhookServer');

const fs = require('fs');
const path = require('path');

let Service;
let Characteristic;
const instances = [];

let HomebridgeAPI; // capture api so we can get persistPath()

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

const DoorState = Object.freeze({
    OPEN: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
    STOPPED: 4
});

class GarageDoorOpener {
    constructor(log, config) {
        this.log = log;
        this.config = config;

        // Destructure config with defaults
        const {
            name,
            openURL,
            closeURL,
            openTime = 10,
            closeTime = 10,
            autoClose = false,
            autoCloseDelay = 20,
            hasClosedSensor,
            hasOpenSensor,
            manufacturer = packageJson.author.name,
            serial = packageJson.version,
            model = packageJson.name,
            firmware = packageJson.version,
            username = null,
            password = null,
            timeout = 3000,
            webhookPort = null,
            http_method = 'GET',
            debug = false
        } = config;

        Object.assign(this, {
            name, openURL, closeURL, openTime, closeTime, 
            autoClose, autoCloseDelay, hasClosedSensor, hasOpenSensor, manufacturer, serial, model, firmware,
            username, password, timeout, webhookPort, http_method, 
        });

        if (autoClose && (hasClosedSensor || hasOpenSensor) ) {
            throw new Error('autoClose cannot be used with hasClosedSensor or hasOpenSensor');
        }

        if (typeof openURL !== 'string' || openURL.length === 0) {
            throw new Error('openURL must be a non-empty string');
        }

        if (!autoClose && (typeof closeURL !== 'string' || closeURL.length === 0)) {
            throw new Error('closeURL must be a non-empty string if autoClose is not used');
        }

        if (autoClose && webhookPort) {
            throw new Error('autoClose cannot be used with webhook. Remove webhookPort or set to zero');
        }

        if (!autoClose && !hasClosedSensor && !hasOpenSensor) {
            throw new Error('hasClosedSensor or hasOpenSensor must be set if autoClose is not used');
        }

        this.auth = (username && password) ? { user: username, pass: password } : undefined;
        this.httpClient = new HttpClient(log, { debug, http_method, timeout, auth: this.auth });

        if (webhookPort) {
            this.webhookServer = new WebhookServer(log, webhookPort, debug, (queryParams) => this.handleWebhook(queryParams));
        }

        this.service = new Service.GarageDoorOpener(name);
        this.informationService = null;
        this.delayedActionTimeoutID = null;
        this.debug = debug;
        this.inHttpRequest = false;

        // For saving initial state
        this.stateFile = path.join(
            HomebridgeAPI.user.persistPath(),
            `garage-door-state-${slug(this.name)}.json`
        );

        instances.push(this);
    }


    _loadPersistedState(defaultState) {
        try {
            const raw = fs.readFileSync(this.stateFile, 'utf8');
            const obj = JSON.parse(raw);
            const v = Number(obj.current);
            if ([0, 1, 2, 3, 4].includes(v)) return v;
        } catch {
            this._debugLog('No persisted state found, using default');
        }
        return defaultState;
    }

    _savePersistedState(state) {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify({ current: state }));
        } catch (e) {
            this.log.warn('Failed to save state:', e.message);
        }
    }

    static configure(api) {

        Service = api.hap.Service;
        Characteristic = api.hap.Characteristic;

        HomebridgeAPI = api;
    }

    identify(callback) {
        this.log('Identify requested!');
        callback();
    }

    _httpRequest(url, method, callback) {

        // Keep track of whether we're in an HTTP request
        this.inHttpRequest = true;

        const doCallback = (error) => {
            this.inHttpRequest = false;
            callback(error);
        };

        // If the url starts with http://test-donotcall then don't actually make the call
        // but behave as if it succeeded
        if (url.startsWith('http://test-donotcall')) {
            this.log('Simulating HTTP %s request to %s', method, url);
            setTimeout(() => { doCallback(null /* no error */) }, 500);
        }
        else {
            this.httpClient.request(url, method, doCallback);
        }
    }

    _simulateMissingClosedSensor(logMessage) {
        this._delayedAction(this.closeTime, () => {
            this._setCurrentDoorState(DoorState.CLOSED);
            this._clearDelayedAction();
            this.log(logMessage);
        });
    }

    _simulateMissingOpenSensor(logMessage, onOpenCallback) {
        this._delayedAction(this.openTime, () => {
            this._setCurrentDoorState(DoorState.OPEN);
            this._clearDelayedAction();
            this.log(logMessage);
        });
        if (onOpenCallback) {
            onOpenCallback();
        }
    }

    _catchMissingClosedSensorUpdate() {
        // This timer action gets cancelled when the closed sensor triggers
        this._delayedAction(this.closeTime * 1.5, () => {
            this.log.warn('Closed sensor did not trigger, assuming door is stopped');
            this._setCurrentDoorState(DoorState.STOPPED);
        });
    }

    _catchMissingOpenSensorUpdate() {
        // This timer action gets cancelled when the open sensor triggers
        this._delayedAction(this.openTime * 1.5, () => {
            this.log.warn('Open sensor did not trigger, assuming door is stopped');
            this._setCurrentDoorState(DoorState.STOPPED);
        });
    }

    _startDoorClose(callback) {
        this.log('Starting to close the door');
        // Make sure any oustanding delayed action is cancelled
        this._clearDelayedAction();

        this._setCurrentDoorState(DoorState.CLOSING);

        if (this.autoClose) {
            // If autoClose is enabled, there's no closeURL to call
            // Just simulate the close
            this._simulateMissingClosedSensor('Door closed (auto close simulated)');
            return;
        }

        this._httpRequest(this.closeURL, this.http_method, (error) => {
            if (error) {
                this.log.warn('Error sending door close command: %s', error.message);
                // Revert to open state on error
                this._setFinalDoorStateOverride(DoorState.OPEN);
                callback(error);
            } else {
                if (!this.hasClosedSensor) {
                    this._simulateMissingClosedSensor('Door closed (simulated)');
                }
                else
                {
                    this._catchMissingClosedSensorUpdate();
                }
                callback();
            }
        });
    }

    _startDoorOpen(callback) {
        this.log('Starting to open the door');
        // Make sure any oustanding delayed action is cancelled
        this._clearDelayedAction();

        this._setCurrentDoorState(DoorState.OPENING);
        this._httpRequest(this.openURL, this.http_method, (error) => {
            if (error) {
                this.log.warn('Error sending door open command: %s', error.message);
                // Revert to closed state on error
                this._setFinalDoorStateOverride(DoorState.CLOSED);
                callback(error);
            } else {
                if (!this.hasOpenSensor) {

                    this._simulateMissingOpenSensor('Door opened (simulated)',

                        // Once opened, trigger auto-close if enabled
                        () => {
                            if (this.autoClose) {
                                this._delayedAction(this.autoCloseDelay, () => {

                                    this.log('Starting the auto close');

                                    // make sure homekit ui is updated correctly by using targetDoorState setter
                                    // setting the targetDoorState here does not trigger _setTargetDoorState callback
                                    // it just sets the value in Homekit
                                    this._setTargetDoorState(DoorState.CLOSED);

                                    this._setCurrentDoorState(DoorState.CLOSING);

                                    // Never a closed sensor in autoClose mode
                                    this._simulateMissingClosedSensor('Door closed (auto-close simulated)');
                                });
                            }
                        });
                }
                else {
                    this._catchMissingOpenSensorUpdate()
                }
                callback();
            }
        });
    }

    // Called when HomeKit wants to change the target door state
    setTargetDoorStateHook(value, callback) {

        const currentState = this._getCurrentDoorState();
        // comman to change the door state (e.g. DoorState.CLOSED to close it)
        this.log('Setting targetDoorState to %s', value);
        if (value === currentState) {
            this.log('Target state is the same as current state, no action needed - state = %s', value);
        }
        else if (value === DoorState.CLOSED) {
            if (currentState === DoorState.CLOSING) {
                this.log('Door is already closing, no action needed');
            }
            else {
                if (this.autoClose) {
                    this.log('Now auto closing the door');
                }
                this._startDoorClose(callback);
                return;
            }
        }
        else if (value === DoorState.OPEN) {
            if (currentState === DoorState.OPENING) {
                this.log('Door is already opening, no action needed');
            }
            else {
                this._startDoorOpen(callback);
                return;
            }
        }
        else {
            this.log.warn('Unsupported targetDoorState value: %s', value);
        }

        callback();
    }

    _getCurrentDoorState() {
        return this.service.getCharacteristic(Characteristic.CurrentDoorState).value;
    }

    _setCurrentDoorState(state) {
        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(state);
        if (!this.autoClose) {
            // Save the state to survive homebridge restarts
            this._savePersistedState(state);
        }
    }

    // Used to set the targetDoorState without triggering the callback
    _setTargetDoorState(state) {
        // setting the targetDoorState here does not trigger _setTargetDoorState callback
        // it just sets the value in Homekit
        this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(state);
    }

    // Used to override the final door state after an operation has failed or there was a background update
    _setFinalDoorStateOverride(state) {

        this._setTargetDoorState(state);
        this._setCurrentDoorState(state);
    }

    _clearDelayedAction() {
        // Stopped any pending delayed action and prevent callback being invoked
        if (this.delayedActionTimeoutID) {
            clearTimeout(this.delayedActionTimeoutID);
            this.delayedActionTimeoutID = null;
        }
    }

    _delayedAction(delayInSecs, action) {
        this._clearDelayedAction();
        this.delayedActionTimeoutID = setTimeout(() => {
            // Clear the timeout ID before calling the action to prevent re-entrancy issues
            this.delayedActionTimeoutID = null;
            action();
        }, delayInSecs * 1000);
    }

    handleWebhook(query) {
        const currentState = this._getCurrentDoorState();
        const targetState = this.service.getCharacteristic(Characteristic.TargetDoorState).value;
        this._debugLog('Webhook received 2, currentState: %s, targetState: %s, query: %j', currentState, targetState, query);

        const isBackgroundUpdate = query.background === 'true';

        // Do the background update only if door is not moving and there's no outstanding delayed
        // action or http request
        const applyBackgroundUpdate = isBackgroundUpdate && this.delayedActionTimeoutID == null
            && !this.inHttpRequest;      

        if (isBackgroundUpdate) {
            this._debugLog('Received background update query = %s', query);
        
            if (!applyBackgroundUpdate) {
                this._debugLog('Ignoring background update because there is an outstanding operation');
                return;
            }
        }

        if ('open' in query) {
            if (!this.hasOpenSensor) {
                this.log.warn('Received "open" in webhook but hasOpenSensor is not enabled');
                return;
            }

            if ('closed' in query) {
                this.log.warn('Received both "open" and "closed" in webhook, ignoring update');
                return;
            }

            if (applyBackgroundUpdate) {

                if (query.open === 'true') {
                    this._setFinalDoorStateOverride(DoorState.OPEN);
                    this._debugLog('Updating state to open from background update');
                }
                else if (query.open === 'false' && !this.hasClosedSensor) {
                    this._setFinalDoorStateOverride(DoorState.CLOSED);
                    this._debugLog('Updating state to closed from background update');
                }
                return;
            }

            if (query.open === 'true') {
                this._debugLog('Open sensor triggered - door is now open');

                // This could be from a requested homekit action or a manual open
                // So always update the target state to open
                // Also need to set the target door state within _setFinalDoorStateOverride
                // so that homekit gets updated correctly
                this._setFinalDoorStateOverride(DoorState.OPEN);
                // Clear any pending delayed action if from homekit action
                this._clearDelayedAction();
            }
            // The open sensor indicates door has started closing
            else 
            {
                if (currentState === DoorState.CLOSING) {
                    // this is expected so ignore the signal
                    this._debugLog("Door is already closing, ignoring open sensor = false")
                    return;
                }
                // This must be a manual close
                this._debugLog("Door closure was manually started")
                this._setTargetDoorState(DoorState.CLOSED);
                this._setCurrentDoorState(DoorState.CLOSING);

                // If there's no closed sensor then simulate the closed state after the close time
                if (!this.hasClosedSensor) {
                    this._simulateMissingClosedSensor('Door closed after manual request (simulated from open sensor)');
                }
                else {
                    this._catchMissingClosedSensorUpdate();
                }
            }
        }
        else if ('closed' in query) {
            if (!this.hasClosedSensor) {
                this.log.warn('Received "closed" in webhook but hasClosedSensor is not enabled');
                return;
            }

            if (applyBackgroundUpdate) {
                if (query.closed === 'true') {
                    this._setFinalDoorStateOverride(DoorState.CLOSED);
                    this._debugLog('Updating state to closed from background update');
                }
                else if (query.closed === 'false' && !this.hasOpenSensor) {
                    this._setFinalDoorStateOverride(DoorState.OPEN);
                    this._debugLog('Updating state to open from background update');
                }
                return;
            }

            if (query.closed === 'true') {
                this._debugLog('Closed sensor triggered - door is now closed');

                // This could be from a requested homekit action or a manual close
                // So always update the target state to closed
                // Also need to set the target door state within _setFinalDoorStateOverride
                // so that homekit gets updated correctly
                this._setFinalDoorStateOverride(DoorState.CLOSED);
                // Clear any pending delayed action if from homekit action
                this._clearDelayedAction();
            }
            // The closed sensor indicates door has started opening
            else {
                if (currentState === DoorState.OPENING) {
                    // this is expected so ignore the signal
                    this._debugLog("Door is already opening, ignoring closed sensor = false")
                    return;
                }
                // This must be a manual opening
                this._debugLog("Door opening was manually started")
                this._setTargetDoorState(DoorState.OPEN);
                this._setCurrentDoorState(DoorState.OPENING);

                // If there's no open sensor then simulate the open state after the open time
                if (!this.hasOpenSensor) {
                    this._simulateMissingOpenSensor('Door opened after manual request (simulated from closed sensor)');
                }
                else {
                    this._catchMissingOpenSensorUpdate()
                }
            }
        }
    }

    startWebhookServer() {
        if (this.webhookServer) this.webhookServer.start();
    }

    stopWebhookServer() {
        if (this.webhookServer) this.webhookServer.stop();
    }

    _debugLog(...args) {
        if (this.debug) this.log(...args);
    }

    getServices() {
        this._debugLog('Initializing services');
        this.informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

        this.service.getCharacteristic(Characteristic.TargetDoorState)
            .on('set', this.setTargetDoorStateHook.bind(this));

        // Assume the door is closed if auto close or no persisted state
        let persisted = this.autoClose ? DoorState.CLOSED : this._loadPersistedState(DoorState.CLOSED);

        if (persisted === DoorState.OPENING || persisted === DoorState.CLOSING) {
            // If it was opening or closing when HomeKit stopped, assume it is stopped now
            // because we don't know if it finished or not
            persisted = DoorState.STOPPED;
        }

        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(persisted);
        // make Target match Current at boot
        this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(persisted );

        return [this.informationService, this.service];
    }
}

GarageDoorOpener.instances = instances;

module.exports = GarageDoorOpener;
