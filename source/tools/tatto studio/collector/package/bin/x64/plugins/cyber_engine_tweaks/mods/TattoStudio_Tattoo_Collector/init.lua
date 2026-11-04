-- Read-only snapshots through CET + Codeware. No RedHotTools dependency.
local Ref = require('libs/Ref')
local VERSION = '0.5.0'
local session = tostring(os.time()) .. ':' .. tostring(os.clock())
local preview, elapsed, lastError = nil, 0, nil

local function defined(value)
    return value ~= nil and IsDefined(value)
end

local function name(value)
    local ok, text = pcall(NameToString, value)
    if ok and type(text) == 'string' then return text end
    ok, text = pcall(function() return value.value end)
    if ok and type(text) == 'string' then return text end
    return type(value) == 'string' and value or ''
end

local function saveJson(filename, value)
    local ok, text = pcall(json.encode, value)
    if not ok then return false end
    local file = io.open(filename, 'w')
    if not file then return false end
    local written = file:write(text)
    file:close()
    return written ~= nil
end

local function status(source, success, message, count)
    saveJson('snapshot-status.json', {
        version = 2, collector_version = VERSION, collector = 'codeware',
        session_id = session, captured_at = os.time(), source = source,
        success = success, message = message, component_count = count or 0
    })
    if not success and message ~= lastError then
        print('[tatto studio] Snapshot failed: ' .. message)
    end
    lastError = success and nil or message
end

local function readComponent(entity, component)
    local item = {name = name(component:GetName()), type = name(component:GetClassName())}
    if item.name:find('tatto_studio_', 1, true) then return nil end
    local reference
    if component:IsA('entMorphTargetSkinnedMeshComponent') then
        reference = component.morphResource
    elseif component:IsA('entMeshComponent') or component:IsA('entSkinnedMeshComponent') then
        reference = component.mesh
    else
        return nil
    end
    local ok, hash = pcall(function() return tostring(reference.hash) end)
    item.hash = ok and hash or ''
    -- Read script_ref<ResourceAsyncRef> in redscript, where its type is retained.
    -- Hash-only snapshots remain usable if the optional path bridge is unavailable.
    local bridgeOk, resource = pcall(function()
        return entity:TattoStudioGetComponentResource(component)
    end)
    if bridgeOk and defined(resource) then
        item.hash = tostring(resource.hash)
        local path = resource.path
        if type(path) == 'string' and path ~= '' then item.path = path end
    end
    if not item.hash:match('%d') or item.hash:gsub('%D', ''):match('^0*$') then return nil end
    item.appearance = name(component.meshAppearance)
    item.chunk_mask = tostring(component.chunkMask)
    pcall(function() item.enabled = component.isEnabled end)
    pcall(function() item.bind_name = name(component.parentTransform.bindName) end)
    pcall(function() item.skinning_bind = name(component.skinning.bindName) end)
    return item
end

local function readReference(reference)
    local ok, hash = pcall(function() return tostring(reference.hash) end)
    if not ok or not hash:match('^%d+[uUlL]*$') then return nil end
    return {hash = hash:gsub('[uUlL]', '')}
end

local function animationReference(entity, component, graph)
    local ok, resource = pcall(function() return entity:TattoStudioGetAnimationResource(component, graph) end)
    if ok and defined(resource) then
        local result = readReference(resource)
        if result and type(resource.path) == 'string' and resource.path ~= '' then result.path = resource.path end
        if result then return result end
    end
    if graph then return readReference(component.graph) end
    return readReference(component.rig)
end

local function readAnimation(entity, component)
    if not component:IsA('entAnimatedComponent') then return nil end
    local item = {name = name(component:GetName()), type = name(component:GetClassName())}
    if item.name == '' or item.name == 'root' or item.name:find('tatto_studio_', 1, true) then return nil end
    pcall(function() item.rig = animationReference(entity, component, false) end)
    if not item.rig or item.rig.hash:match('^0+$') then return nil end
    pcall(function() item.graph = animationReference(entity, component, true) end)
    pcall(function() item.parent_bind = name(component.parentTransform.bindName) end)
    pcall(function() item.control_bind = name(component.controlBinding.bindName) end)
    pcall(function()
        local transform = component.localTransform
        local position, orientation = transform.Position, transform.Orientation
        local value = {
            position = {x = tonumber(position.x.Bits), y = tonumber(position.y.Bits), z = tonumber(position.z.Bits)},
            orientation = {i = tonumber(orientation.i), j = tonumber(orientation.j), k = tonumber(orientation.k), r = tonumber(orientation.r)}
        }
        for _, key in ipairs({'x', 'y', 'z'}) do if value.position[key] == nil then return end end
        for _, key in ipairs({'i', 'j', 'k', 'r'}) do if value.orientation[key] == nil then return end end
        item.local_transform = value
    end)
    return item
end

local function writeSnapshot(entity, source)
    if not defined(entity) then return end
    local ok, components = pcall(function() return entity:GetComponents() end)
    if not ok or type(components) ~= 'table' then
        status(source, false, 'CET/Codeware GetComponents unavailable; check script compilation and Codeware.')
        return
    end
    local result = {
        version = 2, collector_version = VERSION, collector = 'codeware',
        session_id = session, source = source, captured_at = os.time(),
        path_strategy = 'typed-resource-ref-or-hash', components = {}, animation_components = {}, skipped_errors = 0
    }
    -- Engine hint is only a fallback for fully anonymous custom body assets;
    -- known torso/arm bindings remain authoritative in the editor.
    pcall(function()
        local gender = name(entity:GetResolvedGenderName()):lower()
        if gender == 'male' or gender == 'female' then result.body_gender_hint = gender end
    end)
    for _, component in ipairs(components) do
        local success, item = pcall(readComponent, entity, component)
        if success and item then
            table.insert(result.components, item)
        elseif not success then
            result.skipped_errors = result.skipped_errors + 1
        end
        local rigOk, rig = pcall(readAnimation, entity, component)
        if rigOk and rig then table.insert(result.animation_components, rig) end
    end
    if #result.components == 0 then
        status(source, false, 'No mesh components captured; the previous snapshot was preserved.')
        return
    end
    local filename = source == 'appearance' and 'appearance-snapshot.json' or 'player-snapshot.json'
    if not saveJson(filename, result) then
        status(source, false, 'Cannot write snapshot in the collector folder.')
        return
    end
    status(source, true, 'Snapshot captured.', #result.components)
end

registerForEvent('onInit', function()
    ObserveAfter('gameuiPuppetPreviewGameController', 'OnPreviewInitialized', function(controller)
        local entity = controller:GetGamePuppet()
        if defined(entity) then
            preview = Ref.Weak(entity)
            writeSnapshot(entity, 'appearance')
        end
    end)
    ObserveBefore('gameuiPuppetPreviewGameController', 'OnUninitialize', function() preview = nil end)
end)
registerForEvent('onUpdate', function(delta)
    elapsed = elapsed + delta
    if elapsed < 10 then return end
    elapsed = 0
    if defined(preview) then writeSnapshot(preview, 'appearance')
    else writeSnapshot(Game.GetPlayer(), 'player') end
end)
registerHotkey('tatto_studio_tattoo_collect', 'tatto studio / Capture character snapshot', function()
    if defined(preview) then writeSnapshot(preview, 'appearance')
    else writeSnapshot(Game.GetPlayer(), 'player') end
end)
return {version = VERSION, collector = 'codeware'}
