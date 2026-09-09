package org.organiclab.mobile

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Serves the bundled Ketcher page on a random loopback-only port. */
class KetcherAssetServerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val lock = Any()
  private var serverSocket: ServerSocket? = null
  private var executor: ExecutorService? = null
  private var assetFile: File? = null

  override fun getName() = "KetcherAssetServer"

  @ReactMethod
  fun start(assetUri: String, promise: Promise) {
    try {
      val port = synchronized(lock) {
        assetFile = validateAsset(assetUri)
        serverSocket?.localPort ?: startServerLocked()
      }
      promise.resolve("http://127.0.0.1:$port/ketcher/index.html")
    } catch (error: Exception) {
      promise.reject("KETCHER_SERVER_START_FAILED", error.message, error)
    }
  }

  private fun validateAsset(assetUri: String): File {
    val path = Uri.parse(assetUri).path ?: throw IllegalArgumentException("Missing asset path")
    val file = File(path).canonicalFile
    val allowedRoots = listOf(reactContext.cacheDir.canonicalFile, reactContext.filesDir.canonicalFile)
    val isInsideApp = allowedRoots.any { root ->
      file.path == root.path || file.path.startsWith(root.path + File.separator)
    }
    require(isInsideApp && file.isFile && file.extension == "html") {
      "Ketcher asset must be an app-local HTML file"
    }
    return file
  }

  private fun startServerLocked(): Int {
    val socket = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
    val pool = Executors.newCachedThreadPool()
    serverSocket = socket
    executor = pool
    pool.execute {
      while (!socket.isClosed) {
        try {
          val client = socket.accept()
          pool.execute { serve(client) }
        } catch (_: Exception) {
          if (!socket.isClosed) closeServer()
        }
      }
    }
    return socket.localPort
  }

  private fun serve(client: Socket) {
    client.use { connection ->
      connection.soTimeout = 5_000
      val reader = BufferedReader(InputStreamReader(connection.getInputStream()))
      val requestLine = reader.readLine().orEmpty()
      while (reader.readLine()?.isNotEmpty() == true) {
        // Headers are intentionally ignored; this server exposes one immutable asset.
      }

      val writer = BufferedWriter(OutputStreamWriter(connection.getOutputStream()))
      if (requestLine.startsWith("GET /ketcher/index.html ")) {
        val page = synchronized(lock) { assetFile }
          ?: throw IllegalStateException("Ketcher asset is not configured")
        writer.write("HTTP/1.1 200 OK\r\n")
        writer.write("Content-Type: text/html; charset=utf-8\r\n")
        writer.write("Content-Length: ${page.length()}\r\n")
        writer.write("Cache-Control: no-store\r\n")
        writer.write("X-Content-Type-Options: nosniff\r\n")
        writer.write("Connection: close\r\n\r\n")
        writer.flush()
        page.inputStream().use { asset ->
          asset.copyTo(connection.getOutputStream(), 64 * 1024)
        }
      } else {
        writer.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n")
        writer.flush()
      }
    }
  }

  private fun closeServer() = synchronized(lock) {
    serverSocket?.close()
    serverSocket = null
    executor?.shutdownNow()
    executor = null
  }

  override fun invalidate() {
    closeServer()
    super.invalidate()
  }
}
