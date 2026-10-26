package expo.modules.calllog

import android.provider.CallLog
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallLog")

    AsyncFunction("load") { limit: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val list = mutableListOf<Map<String, Any?>>()

      val projection = arrayOf(
        CallLog.Calls.NUMBER,
        CallLog.Calls.DURATION,
        CallLog.Calls.DATE,
        CallLog.Calls.TYPE
      )

      val sortOrder = "${CallLog.Calls.DATE} DESC LIMIT $limit"

      val cursor = context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        projection,
        null,
        null,
        sortOrder
      )

      cursor?.use {
        val numberIdx = it.getColumnIndex(CallLog.Calls.NUMBER)
        val durationIdx = it.getColumnIndex(CallLog.Calls.DURATION)
        val dateIdx = it.getColumnIndex(CallLog.Calls.DATE)
        val typeIdx = it.getColumnIndex(CallLog.Calls.TYPE)

        while (it.moveToNext()) {
          val number = if (numberIdx != -1) it.getString(numberIdx) else "Unknown"
          val duration = if (durationIdx != -1) it.getLong(durationIdx) else 0L
          val date = if (dateIdx != -1) it.getLong(dateIdx) else 0L
          val typeInt = if (typeIdx != -1) it.getInt(typeIdx) else 0

          val typeStr = when (typeInt) {
            CallLog.Calls.INCOMING_TYPE -> "INCOMING"
            CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
            CallLog.Calls.MISSED_TYPE -> "MISSED"
            CallLog.Calls.REJECTED_TYPE -> "REJECTED"
            CallLog.Calls.BLOCKED_TYPE -> "BLOCKED"
            else -> "OTHER"
          }

          list.add(
            mapOf(
              "phoneNumber" to (number ?: "Unknown"),
              "duration" to duration,
              "timestamp" to date.toString(),
              "type" to typeStr
            )
          )
        }
      }

      list
    }
  }
}
