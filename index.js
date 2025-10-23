const GarageDoorOpener = require('./src/garageDoorOpener');

module.exports = function(homebridge) {


    GarageDoorOpener.configure( homebridge);

    homebridge.registerAccessory(
        'homebridge-garage-door-relay',
        'GarageDoorOpener',
        GarageDoorOpener
    );

    homebridge.on('didFinishLaunching', () => {
        GarageDoorOpener.instances.forEach(instance => {
            if (typeof instance.startWebhookServer === 'function') {
                instance.startWebhookServer();
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
