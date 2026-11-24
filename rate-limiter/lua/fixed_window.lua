-- KEYS[1] = rate limit key
-- ARGV[1] = max_requests, ARGV[2] = window_seconds, ARGV[3] = current_time
local key = KEYS[1]
local max_req = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local window_start = math.floor(now / window) * window
local window_key = key .. ':' .. window_start

local count = tonumber(redis.call('GET', window_key)) or 0

if count < max_req then
    redis.call('INCR', window_key)
    redis.call('EXPIRE', window_key, window + 1)
    return {1, max_req - count - 1, 0}
else
    local retry = window_start + window - now
    return {0, 0, math.ceil(retry)}
end
