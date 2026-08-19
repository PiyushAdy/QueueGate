local holdsSet = KEYS[1]
local detailsHash = KEYS[2]
local eventId = ARGV[1]
local currentTimeMs = tonumber(ARGV[2])

-- Find all queueIds where expiresAt (score) is <= currentTimeMs
local expiredQueueIds = redis.call('ZRANGEBYSCORE', holdsSet, '-inf', currentTimeMs)

if #expiredQueueIds == 0 then
    return {}
end

local processedQueueIds = {}

for i, queueId in ipairs(expiredQueueIds) do
    local detailsKey = 'event:' .. eventId .. ':queueDetails:' .. queueId
    local status = redis.call('HGET', detailsKey, 'status')
    
    -- Only expire if they are still 'admitted'
    -- If they booked successfully, they shouldn't be here, but double-checking is safe
    if status == 'admitted' then
        redis.call('HSET', detailsKey, 'status', 'expired')
        redis.call('HINCRBY', detailsHash, 'availableInventory', 1)
        
        -- Add TTL (1 hour) so Redis automatically cleans up this memory later
        redis.call('EXPIRE', detailsKey, 3600)
        
        -- Also expire the mapping key so they can rejoin or to prevent memory leak
        local clientId = redis.call('HGET', detailsKey, 'clientId')
        if clientId then
            redis.call('EXPIRE', 'event:' .. eventId .. ':' .. clientId, 3600)
        end
        
        table.insert(processedQueueIds, queueId)
    end
    
    -- Remove from the admitted holds set regardless
    redis.call('ZREM', holdsSet, queueId)
end

return processedQueueIds
