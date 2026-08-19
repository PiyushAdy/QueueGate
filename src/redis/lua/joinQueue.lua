local clientKey = KEYS[1]
local seqKey = KEYS[2]
local queueSet = KEYS[3]
local clientId = ARGV[1]
local newQueueId = ARGV[2]
local queueTokenHash = ARGV[3]
local joinedAt = ARGV[4]
local eventId = ARGV[5]

local existingQueueId = redis.call('GET', clientKey)

if existingQueueId then
    local detailsKey = 'event:' .. eventId .. ':queueDetails:' .. existingQueueId
    local status = redis.call('HGET', detailsKey, 'status')

    if status and status ~= 'expired' then
        local ticketNum = redis.call('HGET', detailsKey, 'ticketNum')
        local rank = redis.call('ZRANK', queueSet, clientId)
        local currentPos = rank and (rank + 1) or nil

        return {
            'EXISTING',
            existingQueueId,
            tostring(ticketNum or ''),
            tostring(currentPos or ''),
            tostring(status or 'waiting')
        }
    end
end

local newSeq = redis.call('INCR', seqKey)
local detailsKey = 'event:' .. eventId .. ':queueDetails:' .. newQueueId
redis.call('ZADD', queueSet, newSeq, clientId)
redis.call('SET', clientKey, newQueueId)
redis.call('HSET', detailsKey,
    'clientId', clientId,
    'ticketNum', newSeq,
    'queueTokenHash', queueTokenHash,
    'joinedAt', joinedAt,
    'status', 'waiting'
)

local rank = redis.call('ZRANK', queueSet, clientId)
local currentPos = rank and (rank + 1) or nil
return {
    'NEW',
    newQueueId,
    tostring(newSeq),
    tostring(currentPos),
    'waiting'
}
