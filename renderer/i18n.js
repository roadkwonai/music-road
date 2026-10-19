'use strict'
// ── 화면 다국어 ──────────────────────────────────────────────────────────────────
// The window shows the language the main process chose (window.yue.lang: settings, else
// the installer's choice, else the country of the connection, else Windows). Every text
// on the page and its title / placeholder / tooltip / label attributes are translated
// as they appear, by a MutationObserver — so the code keeps writing Korean and nothing
// is missed. confirm() and alert() are translated on the way out.
// Left alone: anything inside [data-i18n="off"] (song titles, lyrics, project and file
// names the user chose), form fields' values, and Korean typed by the user.

const I18N_LANG = (window.yue && window.yue.lang) || 'ko'
const tr = RoadI18n.createTranslator(I18N_LANG === 'ko' ? null : (window.ROAD_LOCALES || {})[I18N_LANG])
document.documentElement.lang = I18N_LANG

;(function () {
  if (I18N_LANG === 'ko') return
  const ATTRS = ['title', 'placeholder', 'data-tip', 'aria-label', 'alt']
  // Sung lines in the mini player are the user's words even when one happens to equal a label.
  const SKIP = '[data-i18n="off"], textarea, script, style, .mini-lyrics-list'

  // Typed text is never touched, but a text box's own hint (placeholder, tooltip) is UI.
  const SKIP_ATTRS = '[data-i18n="off"], script, style'
  const skipped = (el) => el && el.closest && el.closest(SKIP)
  const attrsSkipped = (el) => el && el.closest && el.closest(SKIP_ATTRS)

  function text (node) {
    if (skipped(node.parentElement)) return
    const out = tr(node.nodeValue)
    if (out !== node.nodeValue) node.nodeValue = out
  }

  function attrs (el) {
    if (attrsSkipped(el)) return
    for (const name of ATTRS) {
      const value = el.getAttribute(name)
      if (!value) continue
      const out = tr(value)
      if (out !== value) el.setAttribute(name, out)
    }
  }

  function tree (root) {
    if (root.nodeType === 3) return text(root)
    if (root.nodeType !== 1) return
    attrs(root)
    if (skipped(root)) return
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType !== 1 || !n.matches(SKIP)) return NodeFilter.FILTER_ACCEPT
        attrs(n) // a text box: its hint, not its text
        return NodeFilter.FILTER_REJECT
      }
    })
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 3) text(n)
      else attrs(n)
    }
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(tree)
      else if (r.type === 'characterData') text(r.target)
      else if (r.type === 'attributes') attrs(r.target)
    }
  })

  function start () {
    tree(document.body)
    document.title = tr(document.title)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()

  const nativeConfirm = window.confirm.bind(window)
  const nativeAlert = window.alert.bind(window)
  window.confirm = (message) => nativeConfirm(tr(String(message == null ? '' : message)))
  window.alert = (message) => nativeAlert(tr(String(message == null ? '' : message)))
})()

// The language menu in the top bar: the choice is saved and the window reloads in it.
function wireLanguageMenu () {
  const select = document.getElementById('langSelect')
  if (!select) return
  select.value = I18N_LANG
  select.onchange = async () => {
    const next = select.value
    if (typeof studio !== 'undefined' && studio.frame) {
      select.value = I18N_LANG
      return toast(tr('영상을 만드는 중에는 언어를 바꿀 수 없습니다. 끝난 뒤에 바꿔 주세요.'), 6000)
    }
    await window.yue.setLanguage(next)
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireLanguageMenu, { once: true })
else wireLanguageMenu()
