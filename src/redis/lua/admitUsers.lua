
local queueSet = KEYS[1]
local detailsHash=KEYS[2]
local eventId=ARGV[1]
local batchSize=tonumber(ARGV[2])
local currentTimeMs=tonumber(ARGV[3])
-- unix timestamp mei bhejna hai in miliseconds
-- NodeJS now already sends that in ms

local availableInventory=tonumber(redis.call('HGET',detailsHash,'availableInventory'))
local holdSeconds = tonumber(redis.call('HGET', detailsHash, 'holdSec'))

if not availableInventory or availableInventory <= 0 then
        return {}
end

local toadmit=math.min(batchSize,availableInventory)
local admittedQueueIds = {}
    local expiresAt = currentTimeMs + (holdSeconds * 1000)

    for i = 1, toadmit do
        local popped = redis.call('ZPOPMIN', queueSet)
        if #popped == 0 then
            break
        end

        local clientId = popped[1]
        local queueId = redis.call('GET', 'event:' .. eventId .. ':' .. clientId)

        if queueId then
            redis.call('HINCRBY', detailsHash, 'availableInventory', -1)
            redis.call('HSET', 'event:' .. eventId .. ':queueDetails:' .. queueId, 
                'status', 'admitted',
                'admittedAt', currentTimeMs,
                'expiresAt', expiresAt
            )
            table.insert(admittedQueueIds, queueId)
        end
    end
-- returns list of admitted queueIDs so that we can notify them via websockets from nodejs 
return admittedQueueIds



    


