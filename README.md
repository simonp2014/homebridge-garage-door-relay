<p align="center">
  <a href="https://github.com/homebridge/homebridge"><img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" height="140"></a>
</p>

# homebridge-garage-door-relay

[![npm](https://img.shields.io/npm/v/homebridge-garage-door-relay.svg)](https://www.npmjs.com/package/homebridge-garage-door-relay) [![npm](https://img.shields.io/npm/dt/homebridge-garage-door-relay.svg)](https://www.npmjs.com/package/homebridge-garage-door-relay)

This work is forked from https://github.com/calvarium/homebridge-http-garage-door. 

## Description

This [homebridge](https://github.com/nfarina/homebridge) plugin exposes a web-based garage opener to Apple's [HomeKit](http://www.apple.com/ios/home/).
Using simple HTTP requests, the plugin allows you to open/close the garage. It works as a general purpose HTTP client for any relay, but it works particularly wel
l with a Shelly 1 relay.

This version was created with the following aims:
- Use event driven sensor updates instead of polling for improved feedback of door state during operation
- Support garage doors with sensors at the closed position, opened position, both or neither. 

## Installation

1. Install [Homebridge](https://github.com/homebridge/homebridge).
2. Install the plugin by running `npm install -g homebridge-garage-door-relay` or by searching for `homebridge-garage-door-relay` on the [plugins tab](https://github.com/homebridge/homebridge#installing-plugins) if you are using [Homebridge UI](https://www.npmjs.com/package/homebridge-config-ui-x) or [Hoobs](https://hoobs.org/).
3. Update your Homebridge `config.json` accordingly.

## Configuration

NOTE: Don't forget to update `shelly_ip` to the IP address of your Shelly relay.

```json
"accessories": [
     {
        "accessory": "GarageDoorOpener",
        "name": "Back door",
        "http_method": "GET",
        "openURL": "http://shelly_ip/relay/0?turn=on",
        "closeURL": "http://shelly_ip/relay/0?turn=on",
        "autoLock": false,
        "autoLockDelay": 60,
        "openTime": 21,
        "closeTime": 17,
        "polling": true,
        "pollInterval": 60,
        "username": "garage",
        "password": "Mh4hc7EDJF8mMkzv",
        "webhookPort": 51828,
        "manufacturer": "BFT",
        "model": "SCE-MA (Board)",
        "statusURL": "http://shelly_ip/status",
        "statusKey": "$.inputs[0].input",
        "statusValueOpen": "0",
        "statusValueClosed": "1",
        "debug": "false"
    }
]
```

## Options

### Core

| Key         | Description                               | Default |
| ----------- | ----------------------------------------- | ------- |
| `accessory` | Must be `GarageDoorOpener`                | N/A     |
| `name`      | Name to appear in the Home app            | N/A     |
| `openURL`   | URL to trigger the opening of your garage | N/A     |
| `closeURL`  | URL to trigger the closing of your garage | N/A     |

### Optional fields

| Key                  | Description                                                                                                                                                                 | Default             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `openTime`           | Time (in seconds) to simulate your garage opening                                                                                                                           | `10`                |
| `closeTime`          | Time (in seconds) to simulate your garage closing                                                                                                                           | `10`                |
| `autoLock`           | Whether your garage should auto-close after being opened                                                                                                                    | `false`             |
| `autoLockDelay`      | Time (in seconds) until your garage will automatically close (if enabled)                                                                                                   | `20`                |
| `switchOff`          | Closes the garage immediately without animation. For IR remote control use.                                                                                                 | `false`             |
| `switchOffDelay`     | Time (in seconds) until your garage will automatically close without animation (if enabled)                                                                                 | `2`                 |
| `polling`            | Whether the state should be polled at intervals                                                                                                                             | `false`             |
| `pollInterval`       | Time (in seconds) between device polls (if `polling` is enabled)                                                                                                            | `120`               |
| `statusURL`          | URL to retrieve state on poll (if `statusField*` options are not set, expects HTTP response body to be `0` or `1`)                                                          | N/A                 |
| `statusKey`          | [JSONPath](https://www.npmjs.com/package/jsonpath) that identifies the property that contains the status of the door (e.g. `$.inputs[0].input` is the default for Shelly 1) | `$.inputs[0].input` |
| `statusValueOpen`    | Regex that will match the `open` state of the relay status (e.g. `open`)                                                                                                    | `0`                 |
| `statusValueClosed`  | Regex that will match the `closed` state of the relay status (e.g. `closed`)                                                                                                | `1`                 |
| `statusValueOpening` | Regex that will match the `opening` state of the relay status (e.g. `opening`)                                                                                              | `2`                 |
| `statusValueClosing` | Regex that will match the `closing` state of the relay status (e.g. `closing`)                                                                                              | `3`                 |

### Additional options

| Key            | Description                                                                                        | Default |
| -------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `timeout`      | Time (in milliseconds) until the accessory will be marked as _Not Responding_ if it is unreachable | `3000`  |
| `http_method`  | HTTP method used to communicate with the device                                                    | `GET`   |
| `username`     | Username if HTTP authentication is enabled                                                         | N/A     |
| `password`     | Password if HTTP authentication is enabled                                                         | N/A     |
| `webhookPort`  | Port for local webhook server triggered at `/garage/update`                     | N/A     |
| `model`        | Appears under the _Model_ field for the accessory                                                  | plugin  |
| `serial`       | Appears under the _Serial_ field for the accessory                                                 | version |
| `manufacturer` | Appears under the _Manufacturer_ field for the accessory                                           | author  |
| `firmware`     | Appears under the _Firmware_ field for the accessory                                               | version |
| `debug`        | Display debug messages on Homebridge log                                      | false   |
| `deconzDeviceId` | ID of the deCONZ sensor used for updates                                      | N/A     |
| `deconzHost`   | Hostname of the deCONZ gateway                                                  | 127.0.0.1 |
| `deconzPort`   | Port of the deCONZ websocket                                                    | 443     |

### State key

| State | Description |
| ----- | ----------- |
| `0`   | Open        |
| `1`   | Closed      |
| `2`   | Opening     |
| `3`   | Closing     |
| `4`   | Stopped     |

When the door is moving and a new command is received, the accessory first
marks the door as **Stopped** before reversing its direction. For example,
when opening a closed door and the webhook is triggered again, the sequence is:
`Closed -> Opening -> Stopped -> Closing -> Closed`. The same applies in the
opposite direction.

## Wiring

![Shelly 1 wiring](https://savjee.be/uploads/2020-06-smart-garage-door-shelly-home-assistant/shelly-schematic-dc.png)

More information at https://savjee.be/2020/06/make-garage-door-opener-smart-shelly-esphome-home-assistant/

### Videos on wiring

- [Shelly1 Garage Door Control](https://www.youtube.com/watch?v=aV7gOWjia5w)
- [Automate your Garage Door! The PERFECT First DIY Smart Home Project](https://www.youtube.com/watch?v=WEZUxXNiERQ)

## Door open/closed sensor

In order to know for sure if your gate is open or closed you need to install a Reed Switch sensor connected between `L` and `SW` (order is irrelevant). These cost between €2 and €5.

![Reed Switch](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQlGm8m0RQnE2NE15JjLc4KEOUdR0QghniwDQkSQjto3mPq9qPUVGmlrB5vBVWsL1sJlLU9sWAOs4Y&usqp=CAc)

For Shelly 1 and a normally open reed switch (NO) the following options need to be set:

```json
"accessories": [
     {
       ...
		 "statusKey": "$.inputs[0].input",
		 "statusValueOpen": "0",
		 "statusValueClosed": "1"
		 ...
	  }
	]
```

For a normally closed switch (NC), use:

```json
"accessories": [
     {
       ...
		 "statusKey": "$.inputs[0].input",
		 "statusValueOpen": "1",
		 "statusValueClosed": "0"
		 ...
	  }
	]
```

## deCONZ integration

When `deconzDeviceId` is set, the accessory listens to the deCONZ websocket for events of that sensor. When an event is received, the door state is updated immediately. Configure `deconzHost` and `deconzPort` if your gateway runs on a different host or port.
