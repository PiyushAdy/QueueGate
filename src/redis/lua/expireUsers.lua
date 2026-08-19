local holdsSet = KEYS[1]
local detailsHash = KEYS[2]
local eventId = ARGV[1]
local currentTimeMs = tonumber(ARGV[2])

local expiredQueueIds = redis.call('ZRANGEBYSCORE', holdsSet, '-inf', currentTimeMs)

if #expiredQueueIds == 0 then
    return {}
end

local processedQueueIds = {}

for i, queueId in ipairs(expiredQueueIds) do
    local detailsKey = 'event:' .. eventId .. ':queueDetails:' .. queueId
    local status = redis.call('HGET', detailsKey, 'status')
    
    if status == 'admitted' then
        redis.call('HSET', detailsKey, 'status', 'expired')
        redis.call('HINCRBY', detailsHash, 'availableInventory', 1)
        
        redis.call('EXPIRE', detailsKey, 3600*5)
        local clientId = redis.call('HGET', detailsKey, 'clientId')
        if clientId then
            redis.call('EXPIRE', 'event:' .. eventId .. ':' .. clientId, 3600*5)
        end
        table.insert(processedQueueIds, queueId)
    end
    redis.call('ZREM', holdsSet, queueId)
end

return processedQueueIds
