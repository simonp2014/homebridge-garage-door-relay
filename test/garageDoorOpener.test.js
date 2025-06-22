const GarageDoorOpener = require('../src/garageDoorOpener');

describe('GarageDoorOpener simulate', () => {
  const FakeCharacteristic = class {
    constructor() {
      this.value = null;
    }
    updateValue(val) {
      this.value = val;
    }
    on() {}
  };

  const Service = {
    GarageDoorOpener: class {
      constructor() {
        this.characteristics = {};
      }
      getCharacteristic(name) {
        if (!this.characteristics[name]) {
          this.characteristics[name] = new FakeCharacteristic();
        }
        return this.characteristics[name];
      }
      setCharacteristic(name, value) {
        this.getCharacteristic(name).updateValue(value);
      }
    },
  };

  const Characteristic = {
    CurrentDoorState: 'CurrentDoorState',
    TargetDoorState: 'TargetDoorState',
  };

  GarageDoorOpener.configure(Service, Characteristic);

  let opener;
  beforeEach(() => {
    const log = jest.fn();
    const config = {
      name: 'Test',
      openURL: 'http://open',
      closeURL: 'http://close',
      openTime: 0,
      closeTime: 0,
    };
    opener = new GarageDoorOpener(log, config);
    opener._getStatus = jest.fn();
  });

  test('simulateOpen sets state to opening', () => {
    opener.simulateOpen();
    expect(opener.getCurrentDoorState()).toBe(2);
  });

  test('simulateClose sets state to closing', () => {
    opener.simulateClose();
    expect(opener.getCurrentDoorState()).toBe(3);
  });
});
