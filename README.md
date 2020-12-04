<p align="center">
  <a href="https://github.com/homebridge/homebridge"><img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" height="140"></a>
</p>

# homebridge-garage-door-shelly1

[![npm](https://img.shields.io/npm/v/homebridge-garage-door-shelly1.svg)](https://www.npmjs.com/package/homebridge-garage-door-shelly1) [![npm](https://img.shields.io/npm/dt/homebridge-garage-door-shelly1.svg)](https://www.npmjs.com/package/homebridge-garage-door-shelly1)

This work is forked from https://github.com/andreaseu/homebridge-garage-remote-http. Kudos to Andreas.

## Description

This [homebridge](https://github.com/nfarina/homebridge) plugin exposes a web-based garage opener to Apple's [HomeKit](http://www.apple.com/ios/home/). Using simple HTTP requests, the plugin allows you to open/close the garage. It works as a general purpose HTTP client for any relay, but it works particularly well with a Shelly 1 relay.

## Wiring 

![Shelly 1 wiring](https://savjee.be/uploads/2020-06-smart-garage-door-shelly-home-assistant/shelly-schematic-dc.png)

More information at https://savjee.be/2020/06/make-garage-door-opener-smart-shelly-esphome-home-assistant/

### Videos on wiring

- [Shelly1 Garage Door Control](https://www.youtube.com/watch?v=aV7gOWjia5w)
- [Automate your Garage Door! The PERFECT First DIY Smart Home Project](https://www.youtube.com/watch?v=WEZUxXNiERQ)

## Installation

1. Install [homebridge](https://github.com/nfarina/homebridge#installation-details)
2. Install this plugin: `npm install -g homebridge-garage-door-shelly1`
3. Update your `config.json`

## Configuration example

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
        "manufacturer": "BFT",
        "model": "SCE-MA (Board)",
        "statusURL": "http://shelly_ip/relay/0",
        "statusKey": "$.ison",
        "statusValueOpen": "true",
        "statusValueClosed": "false"
    }
]
```

### Core
| Key | Description | Default |
| --- | --- | --- |
| `accessory` | Must be `GarageDoorOpener` | N/A |
| `name` | Name to appear in the Home app | N/A |
| `openURL` | URL to trigger the opening of your garage | N/A |
| `closeURL` | URL to trigger the closing of your garage | N/A |

### Optional fields
| Key | Description | Default |
| --- | --- | --- |
| `openTime` | Time (in seconds) to simulate your garage opening | `10` |
| `closeTime` | Time (in seconds) to simulate your garage closing | `10` |
| `autoLock` | Whether your garage should auto-close after being opened | `false` |
| `autoLockDelay` | Time (in seconds) until your garage will automatically close (if enabled) | `20` |
| `switchOff` | Closes the garage immediately without animation. For IR remote control use. | `false` |
| `switchOffDelay` | Time (in seconds) until your garage will automatically close without animation (if enabled) | `2` |
| `polling` | Whether the state should be polled at intervals | `false` |
| `pollInterval` | Time (in seconds) between device polls (if `polling` is enabled) | `120` |
| `statusURL` | URL to retrieve state on poll (if `statusField*` options are not set, expects HTTP response body to be `0` or `1`) | N/A |
| `statusKey` | [JSONPath](https://www.npmjs.com/package/jsonpath) that identifies the field/key that contains the status of the door (e.g. `$.currentState`) | `$.ison` |
| `statusValueOpen` | Regex that will match the closed state of the `statusValue` (e.g. `0`) | `true`  |
| `statusValueClosed` | Regex that will match the closed state of the `statusValue` (e.g. `1`) | `false` |
| `statusValueOpening` | Regex that will match the closed state of the `statusValue` (e.g. `2`) |  `opening` |
| `statusValueClosing` | Regex that will match the closed state of the `statusValue` (e.g. `3`) | `closing` |


### Additional options
| Key | Description | Default |
| --- | --- | --- |
| `timeout` | Time (in milliseconds) until the accessory will be marked as _Not Responding_ if it is unreachable | `3000` |
| `http_method` | HTTP method used to communicate with the device | `GET` |
| `username` | Username if HTTP authentication is enabled | N/A |
| `password` | Password if HTTP authentication is enabled | N/A |
| `model` | Appears under the _Model_ field for the accessory | plugin |
| `serial` | Appears under the _Serial_ field for the accessory | version |
| `manufacturer` | Appears under the _Manufacturer_ field for the accessory | author |
| `firmware` | Appears under the _Firmware_ field for the accessory | version |

## State key
| State | Description |
| --- | --- |
| `0` | Open |
| `1` | Closed |
| `2` | Opening |
| `3` | Closing |
