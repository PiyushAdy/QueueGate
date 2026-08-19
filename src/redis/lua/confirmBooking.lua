local detailsHash = KEYS[1]
local holdsSet = KEYS[2]
local providedTokenHash = ARGV[1]
local queueId = ARGV[2]
local eventId = ARGV[3]

local status = redis.call('HGET', detailsHash, 'status')
local storedTokenHash = redis.call('HGET', detailsHash, 'queueTokenHash')
if status == 'booked' then
    return {err = 'ALREADY_BOOKED'}
end

if status ~= 'admitted' then
    return {err = 'NOT_ADMITTED'}
end

if storedTokenHash ~= providedTokenHash then
    return {err = 'INVALID_TOKEN'}
end

redis.call('HSET', detailsHash, 'status', 'booked')
redis.call('ZREM', holdsSet, queueId)
redis.call('EXPIRE', detailsHash, 86400)

local clientId = redis.call('HGET', detailsHash, 'clientId')
if clientId then
    redis.call('EXPIRE', 'event:' .. eventId .. ':' .. clientId, 86400)
end
return 'SUCCESS'
