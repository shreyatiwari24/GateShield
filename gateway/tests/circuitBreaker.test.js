const { CircuitBreaker, CircuitOpenError, State } = require('../src/middleware/circuitBreaker');

describe('CircuitBreaker', () => {
  let cb;

  beforeEach(() => {
    cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenMaxAttempts: 1,
    });
  });

  test('starts in CLOSED state', () => {
    expect(cb.state).toBe(State.CLOSED);
    expect(cb.failureCount).toBe(0);
    expect(cb.getState().state).toBe('CLOSED');
  });

  test('successful calls keep it CLOSED', async () => {
    const result = await cb.fire(async () => 'success_result');
    expect(result).toBe('success_result');
    expect(cb.state).toBe(State.CLOSED);
    expect(cb.failureCount).toBe(0);
    expect(cb.successCount).toBe(1);
  });

  test('failures above threshold open the circuit', async () => {
    const errorAction = async () => { throw new Error('Service failure'); };

    await expect(cb.fire(errorAction)).rejects.toThrow('Service failure');
    expect(cb.state).toBe(State.CLOSED);
    expect(cb.failureCount).toBe(1);

    await expect(cb.fire(errorAction)).rejects.toThrow('Service failure');
    expect(cb.state).toBe(State.CLOSED);
    expect(cb.failureCount).toBe(2);

    await expect(cb.fire(errorAction)).rejects.toThrow('Service failure');
    expect(cb.state).toBe(State.OPEN);
    expect(cb.failureCount).toBe(3);
  });

  test('OPEN state rejects immediately', async () => {
    cb.state = State.OPEN;
    cb.lastFailureTime = Date.now();

    const mockAction = jest.fn();
    await expect(cb.fire(mockAction)).rejects.toThrow(CircuitOpenError);
    expect(mockAction).not.toHaveBeenCalled();
  });

  test('after timeout, moves to HALF_OPEN', async () => {
    cb.state = State.OPEN;
    cb.lastFailureTime = Date.now() - 1500;

    let executedInHalfOpen = false;
    await cb.fire(async () => {
      executedInHalfOpen = (cb.state === State.HALF_OPEN);
      return 'trial_success';
    });

    expect(executedInHalfOpen).toBe(true);
  });

  test('successful call in HALF_OPEN closes circuit', async () => {
    cb.state = State.OPEN;
    cb.lastFailureTime = Date.now() - 1500;

    const result = await cb.fire(async () => 'recovered_data');
    expect(result).toBe('recovered_data');
    expect(cb.state).toBe(State.CLOSED);
    expect(cb.failureCount).toBe(0);
  });

  test('failed call in HALF_OPEN re-opens circuit', async () => {
    cb.state = State.OPEN;
    cb.lastFailureTime = Date.now() - 1500;

    await expect(cb.fire(async () => {
      throw new Error('Trial attempt failed');
    })).rejects.toThrow('Trial attempt failed');

    expect(cb.state).toBe(State.OPEN);
  });
});
