<p align="center">
  <a href="https://github.com/homebridge/homebridge"><img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" height="140"></a>
</p>

# homebridge-garage-door-relay

[![npm](https://img.shields.io/npm/v/homebridge-garage-door-relay.svg)](https://www.npmjs.com/package/homebridge-garage-door-relay) [![npm](https://img.shields.io/npm/dt/homebridge-garage-door-relay.svg)](https://www.npmjs.com/package/homebridge-garage-door-relay)

This work is forked from https://github.com/calvarium/homebridge-http-garage-door. 

## Description

This [homebridge](https://github.com/nfarina/homebridge) plugin exposes a web-based door or gate opener to Apple's [HomeKit](http://www.apple.com/ios/home/).
Using simple HTTP requests, the plugin allows you to open/close the door. It works as a general purpose HTTP client for any relay, but it works particularly wel
l with a Shelly 1 relay.

This version was created with the following aims:

- Use event driven sensor updates instead of polling for improved feedback of door state during operation
- Support doors or gates with sensors at the closed position, opened position, both or neither (an auto close door)
- Support gates or doors that have no sensor but open on request and automatically close after a time period
- For simplicity don't attempt to detect the stopped state, obstruction or when the door reverses during operation
- Persist the door state across Homebridge restarts
- Provide a meachanism to update the door state in the background at periodic intervals in case snesor updates were not successfully delivered

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
        "autoClose": false,
        "autoCloseDelay": 60,
        "hasClosedSensor": true,
        "hasOpenSensor": false,
        "openTime": 21,
        "closeTime": 17,
        "username": "garage",
        "password": "Mh4hc7EDJF8mMkzv",
        "webhookPort": 51828,
        "manufacturer": "BFT",
        "model": "SCE-MA (Board)",
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
| `openURL`   | URL to trigger the opening of your door/gate | N/A     |
| `closeURL`  | URL to trigger the closing of your door/gate | N/A     |
| `hasClosedSensor` | Whether your door/gate has a closed sensor that fires in the fully closed position (true/false) | N/A |
| `hasOpenSensor`   | Whether your door/gate has an open sensor that fires in the fully open position (true/false)   | N/A |

### Optional fields

| Key                  | Description                                                                                                                                                                 | Default             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `openTime`           | Time (in seconds) to simulate your door/gate opening                                                                                                                           | `10`                |
| `closeTime`          | Time (in seconds) to simulate your door/gate closing                                                                                                                           | `10`                |
| `autoClose`           | Whether your door/gate should auto-close after being opened                                                                                                                    | `false`             |
| `autoCloseDelay`      | Time (in seconds) until your door/garage will automatically close (if enabled)                                                                                                   | `20`                |

### Additional options

| Key            | Description                                                                                        | Default |
| -------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `timeout`      | Time (in milliseconds) until the accessory will be marked as _Not Responding_ if it is unreachable | `3000`  |
| `http_method`  | HTTP method used to communicate with the device                                                    | `GET`   |
| `username`     | Username if HTTP authentication is enabled                                                         | N/A     |
| `password`     | Password if HTTP authentication is enabled                                                         | N/A     |
| `webhookPort`  | Port for local webhook server triggered at `http://[homebridge ip]:[webhookport/`                     | N/A     |
| `model`        | Appears under the _Model_ field for the accessory                                                  | plugin  |
| `serial`       | Appears under the _Serial_ field for the accessory                                                 | version |
| `manufacturer` | Appears under the _Manufacturer_ field for the accessory                                           | author  |
| `firmware`     | Appears under the _Firmware_ field for the accessory                                               | version |
| `debug`        | Display debug messages on Homebridge log                                      | false   |

### State key

| State | Description |
| ----- | ----------- |
| `0`   | Open        |
| `1`   | Closed      |
| `2`   | Opening     |
| `3`   | Closing     |
| `4`   | Stopped     |


## Wiring

![Shelly 1 wiring](https://savjee.be/uploads/2020-06-smart-garage-door-shelly-home-assistant/shelly-schematic-dc.png)

More information at https://savjee.be/2020/06/make-garage-door-opener-smart-shelly-esphome-home-assistant/

### Videos on wiring

- [Shelly1 Garage Door Control](https://www.youtube.com/watch?v=aV7gOWjia5w)
- [Automate your Garage Door! The PERFECT First DIY Smart Home Project](https://www.youtube.com/watch?v=WEZUxXNiERQ)

## Door / Gate sensors

Door sensors are used to signal changes to this accessory and adjust the door state accordingly. Ideally, for a garage door there would be a sensor at each end of the track to signal when the door is in the fully opened or closed state. Where there is a missing sensor at one end of the track this accessory will simulate the door operation assuming that the door reaches the required state after a specified timeout.

I used two Aqara P2 Door Sensors at each end of the track to detect the door position and send immediate updates through the webhook interface. I did this by creating a HomeKit automation for each sensor for their open and closed states to run a shortcut that fires a web request to the webhook (see below for details).

You could also use a Reed Switch sensor directly wired to the Shelly relay to perform that case of the Open or Closed sensor. (The Shelly relay would need to be configured to call the webhook URL with the required parameters when it's switch input changes state).

The Reed Switch sensor would be connected between `L` and `SW` (order is irrelevant). These cost between €2 and €5.

![Reed Switch](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQlGm8m0RQnE2NE15JjLc4KEOUdR0QghniwDQkSQjto3mPq9qPUVGmlrB5vBVWsL1sJlLU9sWAOs4Y&usqp=CAc)

A Shelly 1 relay can be configured to use its built-in **Actions** to call the webhook interface when the sensor input changes the switch input state:

1. Open your **Shelly 1 Web Interface** (or use the Shelly app).  
   Navigate to: **Settings → Actions** (or **I/O URL Actions** depending on firmware version).

2. Enable **Actions**.

3. Add the URLs you want to trigger:
   - **Button switched ON URL** → e.g.  
     ```
     https://yourserver.example/garage?state=open
     ```
   - **Button switched OFF URL** → e.g.  
     ```
     https://yourserver.example/garage?state=close
     ```

   You can add multiple URLs per action if needed.

The configuration of the accessory needs to specify which sensors will provide status updates. The values are:

- Set *hasClosedSensor = true* if there is a sensor that fires when the door reaches the fully closed position and immediately as the door starts to open
- Set *hasOpenSensor = true* if there is a sensor that fires when the door reaches the fully open position and immediately as the door starts to close

## Webhook Interface

Sensors notify the accessory of changes to the state of the door through the webhook interface. The format of the URL used for these updates is:

http://[ip of homebridge]:[webhookport>]/?[sensor name]=true|false

where [sensor name] is either *open* or *closed*.

For example, if you have Homebridge running on local address 192.168.0.12 and this accessory is configured to have a webhookport of 51827 you would indicate that the door has reached the fully close position with:

http://192.168.0.12:51827/?closed=true (Door is now fully closed)

When the door starts to open this URL would then be triggered:

http://192.168.0.12:51827/?closed=false  (Door has started to open)

In both these cases the accessory must be configured with hasClosedSensor = true.

Similarly, if you have a sensor at the fully open position (i.e. hasOpenSensor = true) you would setup the sensor to fire these URLs as it changed state:

http://192.168.0.12:51827/?open=true (Door is now fully open)

http://192.168.0.12:51827/?open=false  (Door has started to close)








