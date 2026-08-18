package com.alitahseen.notavid

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  @Volatile private var safeTop = 0f
  @Volatile private var safeBottom = 0f

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    // The app is edge-to-edge, so the WebView sits under the system bars and
    // the web UI must pad itself clear of them. WebView support for CSS
    // env(safe-area-inset-*) is not universal, so hand the page the real
    // inset heights (in CSS px) instead: a bridge it can pull from on load,
    // plus a push whenever the insets change (e.g. rotation).
    //
    // addJavascriptInterface exposes the object to EVERY frame, including the
    // cross-origin YouTube embed — keep this interface to harmless numbers
    // only; never add methods that touch files, network, or app state.
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun top() = safeTop
      @JavascriptInterface fun bottom() = safeBottom
    }, "NotavidInsets")

    val density = resources.displayMetrics.density
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      safeTop = bars.top / density
      safeBottom = bars.bottom / density
      view.post {
        webView.evaluateJavascript(
          "document.documentElement.style.setProperty('--safe-top','${safeTop}px');" +
            "document.documentElement.style.setProperty('--safe-bottom','${safeBottom}px');",
          null
        )
      }
      insets
    }
  }
}
