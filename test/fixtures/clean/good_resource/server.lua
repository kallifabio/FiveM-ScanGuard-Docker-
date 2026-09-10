fx_version "cerulean"
game "gta5"
RegisterNetEvent("shop:buy")
AddEventHandler("shop:buy", function(item)
  print("bought", item)
end)
