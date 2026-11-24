-- KEYS[1] = rate limit key
-- ARGV[1] = max_requests, ARGV[2] = window_seconds, ARGV[3] = current_time
local key = KEYS[1]
local max_req = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local curr_window = math.floor(now / window) * window
local prev_window = curr_window - window

local curr_key = key .. ':' .. curr_window
local prev_key = key .. ':' .. prev_window

local curr_count = tonumber(redis.call('GET', curr_key)) or 0
local prev_count = tonumber(redis.call('GET', prev_key)) or 0

local elapsed = now - curr_window
local weight = (window - elapsed) / window
local estimated = prev_count * weight + curr_count

if estimated < max_req then
    redis.call('INCR', curr_key)
    redis.call('EXPIRE', curr_key, window * 2 + 1)
    return {1, math.floor(max_req - estimated - 1), 0}
else
    -- Estimate when enough old requests will have "expired"
    local retry = math.ceil(window - elapsed)
    return {0, 0, retry}
end
