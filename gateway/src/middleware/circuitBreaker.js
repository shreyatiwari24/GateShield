
/**
 * Circuit Breaker pattern implementation to protect
 * the GateShield gateway from cascading failures.
 *
 * States: CLOSED, OPEN, HALF_OPEN
 */

const State = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN: service unavailable') {
    super(message);
    this.name = 'CircuitOpenError';
    this.status = 503;
  }
}

class CircuitBreaker {
  /**
   * @param {object} options
   * @param {number} [options.failureThreshold=5]
   * @param {number} [options.resetTimeout=30000]
   * @param {number} [options.halfOpenMaxAttempts=1]
   */
  constructor(options = {}) {
    this.failureThreshold =
      options.failureThreshold !== undefined
        ? options.failureThreshold
        : 5;

    this.resetTimeout =
      options.resetTimeout !== undefined
        ? options.resetTimeout
        : 30000;

    this.halfOpenMaxAttempts =
      options.halfOpenMaxAttempts !== undefined
        ? options.halfOpenMaxAttempts
        : 1;

    this.state = State.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.halfOpenInFlight = false;
  }

  /**
   * Execute an async operation with circuit breaker protection.
   */
  async fire(fn) {
    const now = Date.now();

    // 1. OPEN state: check whether reset timeout has elapsed
    if (this.state === State.OPEN) {
      if (
        this.lastFailureTime !== null &&
        now - this.lastFailureTime >= this.resetTimeout
      ) {
        this.state = State.HALF_OPEN;
        this.halfOpenAttempts = 0;
        this.halfOpenInFlight = false;
      } else {
        throw new CircuitOpenError('Circuit breaker is OPEN');
      }
    }

    // 2. HALF_OPEN state: allow only limited trial requests
    if (this.state === State.HALF_OPEN) {
      if (
        this.halfOpenInFlight ||
        this.halfOpenAttempts >= this.halfOpenMaxAttempts
      ) {
        throw new CircuitOpenError(
          'Circuit breaker is HALF_OPEN: trial request already in progress'
        );
      }

      this.halfOpenAttempts++;
      this.halfOpenInFlight = true;
    }

    // 3. Execute the backend operation
    try {
      const result = await fn();

      this.onSuccess();
      return result;

    } catch (err) {
      // 4xx means backend is reachable.
      // Network errors, timeouts and 5xx count as failures.
      if (err.response && err.response.status < 500) {
        this.onSuccess();
      } else {
        this.onFailure();
      }

      throw err;

    } finally {
      if (this.state === State.HALF_OPEN) {
        this.halfOpenInFlight = false;
      }
    }
  }

  /**
   * Handle successful operation.
   */
  onSuccess() {
    this.successCount++;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
    this.halfOpenInFlight = false;

    // Successful trial closes the circuit
    if (this.state === State.HALF_OPEN) {
      this.state = State.CLOSED;
    }
  }

  /**
   * Handle failed operation.
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === State.HALF_OPEN) {
      // Failed trial immediately reopens the circuit
      this.state = State.OPEN;
      this.halfOpenAttempts = 0;
      this.halfOpenInFlight = false;

    } else if (this.failureCount >= this.failureThreshold) {
      // Open circuit after reaching failure threshold
      this.state = State.OPEN;
    }
  }

  /**
   * Return current circuit breaker information.
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount,
      failureThreshold: this.failureThreshold,
      resetTimeout: this.resetTimeout,
      halfOpenMaxAttempts: this.halfOpenMaxAttempts,
      halfOpenAttempts: this.halfOpenAttempts,
      halfOpenInFlight: this.halfOpenInFlight,
    };
  }

  /**
   * Reset circuit breaker to initial state.
   */
  reset() {
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.halfOpenInFlight = false;
  }
}

// Registry for per-service circuit breakers
const registry = new Map();

/**
 * Middleware factory to create or retrieve
 * a circuit breaker for a particular service.
 */
function createCircuitBreakerMiddleware(options = {}) {
  const serviceName = options.serviceName || 'default';

  if (!registry.has(serviceName)) {
    registry.set(serviceName, new CircuitBreaker(options));
  }

  const breaker = registry.get(serviceName);

  const middleware = (req, res, next) => {
    req.circuitBreaker = breaker;

    // Let fire() handle OPEN -> HALF_OPEN transition
    if (breaker.state === State.OPEN) {
      const now = Date.now();

      if (
        breaker.lastFailureTime === null ||
        now - breaker.lastFailureTime < breaker.resetTimeout
      ) {
        return res.status(503).json({
          error: 'Service temporarily unavailable',
        });
      }
    }

    next();
  };

  middleware.breaker = breaker;

  return middleware;
}

module.exports = {
  CircuitBreaker,
  CircuitOpenError,
  createCircuitBreakerMiddleware,
  State,
};
