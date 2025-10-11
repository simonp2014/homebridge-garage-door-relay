let Service, Characteristic;
const GarageDoorOpener = require('./src/garageDoorOpener');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    GarageDoorOpener.configure(Service, Characteristic);

    homebridge.registerAccessory(
        'homebridge-garage-door-relay',
        'GarageDoorOpener',
        GarageDoorOpener
    );

    homebridge.on('didFinishLaunching', () => {
        GarageDoorOpener.instances.forEach(instance => {
            if (typeof instance.startWebhookServer === 'function') {
                instance.startWebhookServer();
                // Initialise initial state??
                //instance._getStatus(function() {});
            }
        });
    });

    homebridge.on('shutdown', () => {
        GarageDoorOpener.instances.forEach(instance => {
            if (typeof instance.stopWebhookServer === 'function') {
                instance.stopWebhookServer();
            }
        });
    });
};
