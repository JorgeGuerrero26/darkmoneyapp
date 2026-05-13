package com.darkmoney.app.notificationdetection

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject

object NotificationDetectionSerializer {
  fun toWritableArray(values: Set<String>): WritableArray {
    val array = Arguments.createArray()
    values.sorted().forEach { array.pushString(it) }
    return array
  }

  fun toWritableArray(values: JSONArray): WritableArray {
    val array = Arguments.createArray()
    for (index in 0 until values.length()) {
      val item = values.opt(index)
      when (item) {
        is JSONObject -> array.pushMap(toWritableMap(item))
        is String -> array.pushString(item)
        is Int -> array.pushInt(item)
        is Double -> array.pushDouble(item)
        is Boolean -> array.pushBoolean(item)
        else -> array.pushNull()
      }
    }
    return array
  }

  private fun toWritableMap(value: JSONObject): WritableMap {
    val map = Arguments.createMap()
    val keys = value.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      when (val item = value.opt(key)) {
        is JSONObject -> map.putMap(key, toWritableMap(item))
        is JSONArray -> map.putArray(key, toWritableArray(item))
        is String -> map.putString(key, item)
        is Int -> map.putInt(key, item)
        is Long -> map.putDouble(key, item.toDouble())
        is Double -> map.putDouble(key, item)
        is Boolean -> map.putBoolean(key, item)
        else -> map.putNull(key)
      }
    }
    return map
  }
}
