const packageJson = require('../package.json');
const HttpClient = require('./httpClient');
const WebhookServer = require('./webhookServer');

let Service;
let Characteristic;
const instances = [];

class GarageDoorOpener {
    constructor(log, config) {
        this.log = log;
        this.config = config;

        this.name = config.name;
        this.openURL = config.openURL;
        this.closeURL = config.closeURL;
        this.openTime = config.openTime || 10;
        this.closeTime = config.closeTime || 10;
        this.switchOff = config.switchOff || false;
        this.switchOffDelay = config.switchOffDelay || 2;
        this.autoLock = config.autoLock || false;
        this.autoLockDelay = config.autoLockDelay || 20;
        this.manufacturer = config.manufacturer || packageJson.author.name;
        this.serial = config.serial || packageJson.version;
        this.model = config.model || packageJson.name;
        this.firmware = config.firmware || packageJson.version;
        this.username = config.username || null;
        this.password = config.password || null;
        this.timeout = config.timeout || 3000;
        this.webhookPort = config.webhookPort || null;
        this.http_method = config.http_method || 'GET';
        this.polling = config.polling || false;
        this.pollInterval = config.pollInterval || 120;
        this.statusURL = config.statusURL;
        this.statusKey = config.statusKey || '$.inputs[0].input';
        this.statusValueOpen = config.statusValueOpen || '0';
        this.statusValueClosed = config.statusValueClosed || '1';
        this.statusValueOpening = config.statusValueOpening || '2';
        this.statusValueClosing = config.statusValueClosing || '3';

        if (this.username != null && this.password != null) {
            this.auth = { user: this.username, pass: this.password };
        }

        this.httpClient = new HttpClient(this.log, {
            debug: this.config.debug,
            http_method: this.http_method,
            timeout: this.timeout,
            auth: this.auth,
        });

        if (this.webhookPort) {
            this.webhookServer = new WebhookServer(
                this.log,
                this.webhookPort,
                this.config.debug,
                () => this.handleWebhook()
            );
        }

        this.service = new Service.GarageDoorOpener(this.name);
        this.informationService = null;
        this.movementTimeout = null;
        
        // Used to provent polling during simulated open and close which will always be used
        // when the door is operated.
        this.isInSimulatedMovement = false;

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
        this.httpClient.request(url, body, method, callback);
    }

    _getStatus(callback) {
        if (this.isInSimulatedMovement) {
            if (this.config.debug) {
                this.log('Skipping status update during simulated movement');
            }
            return;
        }
        this.httpClient.getStatus(
            this.statusURL,
            this.statusKey,
            {
                open: this.statusValueOpen,
                closed: this.statusValueClosed,
                opening: this.statusValueOpening,
                closing: this.statusValueClosing,
            },
            (error, statusValue) => {

                if (this.isInSimulatedMovement) {
                    if (this.config.debug) {
                        this.log('Skipping status response during simulated movement');
                    }
                    return;
                }

                if (error) {
                    this.log.error('Error getting status: %s', error.message);
                    this.service
                        .getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(new Error('Polling failed'));
                    callback(error);
                } else {
                    this.service
                        .getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(statusValue);
                    this.service
                        .getCharacteristic(Characteristic.TargetDoorState)
                        .updateValue(statusValue);
                    if (this.config.debug) {
                        this.log('Updated door state to: %s', statusValue);
                    }
                    callback();
                }
            }
        );
    }

    setTargetDoorState(value, callback) {
        let url;
        this.log('Setting targetDoorState to %s', value);
        if (value === 1) {
            url = this.closeURL;
            this.simulateClose();
        } else {
            url = this.openURL;
            this.simulateOpen();
        }
        if (this.config.debug) {
            this.log('Requesting URL: %s', url);
        }
        this._httpRequest(url, '', this.http_method, (error) => {
            if (error) {
                this.log.warn('Error setting targetDoorState: %s', error.message);
                callback(error);
            } else {
                if (value !== 1) {
                    if (this.switchOff) {
                        this.switchOffFunction();
                    }
                    if (this.autoLock) {
                        this.autoLockFunction();
                    }
                }
                callback();
            }
        });
    }

    getCurrentDoorState() {
        return this.service.getCharacteristic(Characteristic.CurrentDoorState).value;
    }

    simulateOpen() {
        if (this.config.debug) {
            this.log('simulateOpen called');
        }
        this.isInSimulatedMovement = true;
        if (this.movementTimeout) {
            clearTimeout(this.movementTimeout);
        }
        this.service
            .getCharacteristic(Characteristic.CurrentDoorState)
            .updateValue(2);
        this.movementTimeout = setTimeout(() => {
            this.movementTimeout = null;
            this.isInSimulatedMovement = false;
            this._getStatus(() => { });
            this.log('Finished opening');
        }, this.openTime * 1000);
    }

    simulateClose() {
        if (this.config.debug) {
            this.log('simulateClose called');
        }
        this.isInSimulatedMovement = true;
        if (this.movementTimeout) {
            clearTimeout(this.movementTimeout);
        }
        this.service
            .getCharacteristic(Characteristic.CurrentDoorState)
            .updateValue(3);
        this.movementTimeout = setTimeout(() => {
            this.movementTimeout = null;
            this.isInSimulatedMovement = false;
            this._getStatus(() => { });
            this.log('Finished closing');
        }, this.closeTime * 1000);
    }

    autoLockFunction() {
        if (this.config.debug) {
            this.log('autoLockFunction called');
        }
        this.log('Waiting %s seconds for autolock', this.autoLockDelay);
        setTimeout(() => {
            this.service.setCharacteristic(Characteristic.TargetDoorState, 1);
            this.log('Autolocking...');
        }, this.autoLockDelay * 1000);
    }

    switchOffFunction() {
        if (this.config.debug) {
            this.log('switchOffFunction called');
        }
        this.log('Waiting %s seconds for switch off', this.switchOffDelay);
        setTimeout(() => {
            this.log('SwitchOff...');
            this._httpRequest(this.closeURL, '', this.http_method, () => { });
        }, this.switchOffDelay * 1000);
    }

    handleWebhook() {
        const currentState = this.getCurrentDoorState();
        const targetState = this.service.getCharacteristic(Characteristic.TargetDoorState).value;
        if (this.config.debug) {
            this.log('Webhook received, currentState: %s, targetState: %s', currentState, targetState);
        }
        try {
            switch (currentState) {
                case 1: // Closed -> start opening
                    this.log('Started opening');
                    this.service
                        .getCharacteristic(Characteristic.TargetDoorState)
                        .updateValue(0);
                    this.simulateOpen();
                    break;
                case 0: // Open -> start closing
                    this.log('Started closing');
                    this.service
                        .getCharacteristic(Characteristic.TargetDoorState)
                        .updateValue(1);
                    this.simulateClose();
                    break;
                case 2: // Opening -> stop
                case 3: // Closing -> stop
                    this.log('Stopping movement');
                    if (this.movementTimeout) {
                        clearTimeout(this.movementTimeout);
                        this.movementTimeout = null;
                    }
                    this.service
                        .getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(4);
                    break;
                case 4: // Stopped -> reverse direction
                    if (targetState === 0) {
                        this.log('Reversing to close');
                        this.service
                            .getCharacteristic(Characteristic.TargetDoorState)
                            .updateValue(1);
                        this.simulateClose();
                    } else {
                        this.log('Reversing to open');
                        this.service
                            .getCharacteristic(Characteristic.TargetDoorState)
                            .updateValue(0);
                        this.simulateOpen();
                    }
                    break;
            }
        } catch (err) {
            this.log.error('Failed to handle webhook: %s', err.message);
        }
    }

    startWebhookServer() {
        if (this.webhookServer) {
            this.webhookServer.start();
        }
    }

    stopWebhookServer() {
        if (this.webhookServer) {
            this.webhookServer.stop();
        }
    }

    getServices() {
        if (this.config.debug) {
            this.log('Initializing services');
        }
        this.informationService = new Service.AccessoryInformation();
        this.informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

        this.service
            .getCharacteristic(Characteristic.TargetDoorState)
            .on('set', this.setTargetDoorState.bind(this));

        if (this.polling) {
            if (this.config.debug) {
                this.log('Polling enabled with interval %s seconds', this.pollInterval);
            }
            this._getStatus(() => { });
            setInterval(() => {
                this._getStatus(() => { });
            }, this.pollInterval * 1000);
        } else {
            if (this.config.debug) {
                this.log('Polling disabled');
            }
            this.service
                .getCharacteristic(Characteristic.CurrentDoorState)
                .updateValue(1);
            this.service
                .getCharacteristic(Characteristic.TargetDoorState)
                .updateValue(1);
        }

        return [this.informationService, this.service];
    }
}

GarageDoorOpener.instances = instances;

module.exports = GarageDoorOpener;
