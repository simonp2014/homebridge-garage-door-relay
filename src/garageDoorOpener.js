const packageJson = require('../package.json');
const HttpClient = require('./httpClient');
const WebhookServer = require('./webhookServer');

let Service;
let Characteristic;
const instances = [];

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

        instances.push(this);
    }

    static configure(service, characteristic) {
        Service = service;
        Characteristic = characteristic;
    }

    identify(callback) {
        this.log('Identify requested!');
        callback();
    }

    _httpRequest(url, body, method, callback) {

        // If the url starts with http://test-donotcall then don't actually make the call
        // but behave as if it succeeded
        if (url.startsWith('http://test-donotcall')) {
            this.log('Simulating HTTP %s request to %s', method, url);
            setTimeout(() => callback(), 500);
        }
        else {
            this.httpClient.request(url, body, method, callback);
        }
    }

    _startDoorClose(callback) {
        this.log('Starting to close the door');
        // Make sure any oustanding delayed action is cancelled
        this._clearDelayedAction();

        this.setCurrentDoorState(DoorState.CLOSING);

        this._httpRequest(this.closeURL, '', this.http_method, (error) => {
            if (error) {
                this.log.warn('Error setting sending door open command: %s', error.message);
                // Revert to open state on error
                this.setCurrentDoorState(DoorState.OPEN);
                callback(error);
            } else {
                if (!this.hasClosedSensor) {
                    // If there's no closed sensor, simulate the door closing
                    // by delayintg the change to the close state
                    this._delayedAction(this.closeTime, () => {
                        this.setCurrentDoorState(DoorState.CLOSED);
                        this.log('Door closed (simulated)');
                    });
                }
                else
                {
                    // Create a delayed action to fire if closed sensor doesn't trigger
                    // after 1.5x the expected close time
                    this._delayedAction(this.closeTime * 1.5, () => {
                        this.log.warn('Closed sensor did not trigger, assuming door is stopped');
                        this.setCurrentDoorState(DoorState.STOPPED);
                    });
                }
                callback();
            }
        });
    }

    _startDoorOpen(callback) {
        this.log('Starting to open the door');
        // Make sure any oustanding delayed action is cancelled
        this._clearDelayedAction();

        this.setCurrentDoorState(DoorState.OPENING);
        this._httpRequest(this.openURL, '', this.http_method, (error) => {
            if (error) {
                this.log.warn('Error setting sending door open command: %s', error.message);
                // Revert to closed state on error
                this.setCurrentDoorState(DoorState.CLOSED);
                callback(error);
            } else {
                if (!this.hasOpenSensor) {
                    // If there's no open sensor, simulate the door opening
                    // by delaying the change to the open state
                    this._delayedAction(this.openTime, () => {
                        this.setCurrentDoorState(DoorState.OPEN);
                        this.log('Door opened (simulated)');

                        // Trigger auto-close if enabled
                        if (this.autoClose) {
                            this._delayedAction(this.autoCloseDelay, () => {
                                this.setCurrentDoorState(DoorState.CLOSING);
                                this.log('Auto-closing door');
                                this._delayedAction(this.closeTime, () => {
                                    this.setCurrentDoorState(DoorState.CLOSED);
                                    this.log('Door closed (auto-close simulated)');
                                });
                            });
                        }
                    });
                }
                else {
                    // Create a delayed action to fire if open sensor doesn't trigger
                    // after 1.5x the expected open time
                    this._delayedAction(this.openTime * 1.5, () => {
                        this.log.warn('Open sensor did not trigger, assuming door is stopped');
                        this.setCurrentDoorState(DoorState.STOPPED);
                    });
                }
                callback();
            }
        });
    }

    setTargetDoorState(value, callback) {

        var currentState = this.getCurrentDoorState();
        // comman to change the door state (e.g. DoorState.CLOSED to close it)
        this.log('Setting targetDoorState to %s', value);
        if (value === currentState) {
            this.log('Target state is the same as current state, no action needed - state = %s', value);
        }
        else if (value === DoorState.CLOSED) {
            if (this.autoClose) {
                this.log('Ignore close request for an auto close door');
            }
            else if (currentState === DoorState.CLOSING) {
                this.log('Door is already closing, no action needed');
            }
            else {
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

    getCurrentDoorState() {
        return this.service.getCharacteristic(Characteristic.CurrentDoorState).value;
    }

    setCurrentDoorState(state) {
        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(state);
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
        const currentState = this.getCurrentDoorState();
        const targetState = this.service.getCharacteristic(Characteristic.TargetDoorState).value;
        this._debugLog('Webhook received 2, currentState: %s, targetState: %s, query: %j', currentState, targetState, query);

        var isBackgroundUpdate = query.background === 'true';
        var isDoorMoving = (currentState === DoorState.OPENING || currentState === DoorState.CLOSING);

        if ('open' in query) {
            if (!this.hasOpenSensor) {
                this.log.warn('Received "open" in webhook but hasOpenSensor is not enabled');
                return;
            }

            if ('closed' in query) {
                this.log.warn('Received both "open" and "closed" in webhook, ignoring upadte');
                return;
            }

            if (isBackgroundUpdate) {
                this._debugLog('Received background update for open sensor value = %s', query.open);

                // If door isn't moving, update the state
                if (!isDoorMoving) {
                    this._debugLog('Updating state from background update');
                    if (query.open === 'true') {
                        this.setCurrentDoorState(DoorState.OPEN);
                        this._debugLog('Updating state to open from background update');
                    }
                    else if (query.open === 'false' && !this.hasClosedSensor) {
                        this.setCurrentDoorState(DoorState.CLOSED);
                        this._debugLog('Updating state to closed from background update');
                    }
                }
                return;
            }

            if (query.open === 'true') {
                // This could be from a requested homekit action or a manual open
                // So always update the target state to open
                this.setCurrentDoorState(DoorState.OPEN);
                // Clear any pending delayed action if from homekit action
                this._clearDelayedAction();
            }
            else if (query.open === 'false' && currentState != DoorState.CLOSING &&
                    !this.hasClosedSensor)
            {
                this._debugLog("Door was closed manually")
                this.setCurrentDoorState(DoorState.CLOSED);
            }
        }
        else if ('closed' in query) {
            if (!this.hasClosedSensor) {
                this.log.warn('Received "closed" in webhook but hasClosedSensor is not enabled');
                return;
            }

            if (isBackgroundUpdate) {
                this._debugLog('Received background update for closed sensor value = %s', query.closed);
                // If door isn't moving, update the state
                if (!isDoorMoving) {
                    this._debugLog('Updating state from background update');
                    if (query.closed === 'true') {
                        this.setCurrentDoorState(DoorState.CLOSED);
                        this._debugLog('Updating state to closed from background update');
                    }
                    else if (query.closed === 'false' && !this.hasOpenSensor) {
                        this.setCurrentDoorState(DoorState.OPEN);
                        this._debugLog('Updating state to open from background update');
                    }
                }
                return;
            }
            if (query.closed === 'true') {
                // This could be from a requested homekit action or a manual close
                // So always update the target state to closed
                this.setCurrentDoorState(DoorState.CLOSED);
                // Clear any pending delayed action if from homekit action
                this._clearDelayedAction();
            }
            else if (query.closed === 'false' && currentState != DoorState.OPENING &&
                !this.hasOpenSensor)
            {
                this._debugLog("Door was opened manually")
                this.setCurrentDoorState(DoorState.OPEN);
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
            .on('set', this.setTargetDoorState.bind(this));

        // Assume the door is closed when HomeKit starts
        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(DoorState.CLOSED);
        this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(DoorState.CLOSED);

        return [this.informationService, this.service];
    }
}

GarageDoorOpener.instances = instances;

module.exports = GarageDoorOpener;
