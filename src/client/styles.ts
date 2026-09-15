const STYLE_ID = 'dsh-reference-scout-styles'

const CSS = String.raw`
.rs-card,.rs-panel,.rs-tool{color:var(--dsw-alias-label-primary,#171717);font:inherit;box-sizing:border-box}
.rs-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:14px;background:var(--dsw-alias-bg-layer-2,#fff);padding:18px;display:grid;gap:16px}
.rs-head,.rs-between,.rs-actions,.rs-meta,.rs-header-action{display:flex;align-items:center;gap:10px}.rs-head,.rs-between{justify-content:space-between}.rs-title{margin:0;font-size:16px;line-height:1.4}.rs-subtle,.rs-hint{color:var(--dsw-alias-label-secondary,#686868);font-size:12px;line-height:1.55}.rs-hint{margin:5px 0 0}.rs-section{border:0;border-top:1px solid var(--dsw-alias-border-l2,#e3e3e3);padding:14px 0 0;margin:0;display:grid;gap:11px}.rs-section>legend{padding:0 8px 0 0;font-weight:650;font-size:13px}.rs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px 14px}.rs-field{display:grid;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary,#686868)}
.rs-input,.rs-select,.rs-textarea{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3,#c8c8c8);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#171717);padding:8px 10px;min-height:36px;font:inherit}.rs-textarea{min-height:72px;resize:vertical}.rs-check,.rs-radio{display:flex;align-items:flex-start;gap:9px;font-size:13px;line-height:1.45}.rs-check input,.rs-radio input{margin-top:2px;accent-color:var(--dsw-alias-brand-primary,#4f46e5)}.rs-radio-group{display:flex;flex-wrap:wrap;gap:14px}.rs-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:11px;background:var(--dsw-alias-bg-layer-3,#f3f3f3)}.rs-badge[data-status=completed],.rs-badge[data-status=configured]{color:var(--dsw-alias-state-success-primary,#16803c);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16803c) 12%,transparent)}.rs-badge[data-status=failed]{color:var(--dsw-alias-state-error-primary,#c62828);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c62828) 12%,transparent)}
.rs-button{border:1px solid var(--dsw-alias-border-l3,#c8c8c8);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#171717);padding:7px 11px;min-height:36px;font:inherit;font-size:12px;cursor:pointer}.rs-button:hover{background:var(--dsw-alias-bg-layer-3,#f1f1f1)}.rs-button-primary{border-color:var(--dsw-alias-button-primary-fill,#4f46e5);background:var(--dsw-alias-button-primary-fill,#4f46e5);color:var(--dsw-alias-label-primary-foreground,#fff)}.rs-button-primary:hover{background:var(--dsw-alias-button-primary-hover,#4338ca)}.rs-button:disabled{opacity:.48;cursor:not-allowed}.rs-danger{color:var(--dsw-alias-state-error-primary,#b42318)}
.rs-button:focus-visible,.rs-input:focus-visible,.rs-select:focus-visible,.rs-textarea:focus-visible,.rs-summary:focus-visible,.rs-header-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f46e5);outline-offset:2px}.rs-live{min-height:18px;margin:0;font-size:12px;color:var(--dsw-alias-label-secondary,#686868)}
.rs-panel{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1,#fff)}.rs-panel-head{padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#e3e3e3)}.rs-panel-scroll{padding:14px 16px 28px;overflow:auto;display:grid;gap:14px}.rs-empty{padding:28px 8px;text-align:center;color:var(--dsw-alias-label-secondary,#686868)}.rs-result{border:1px solid var(--dsw-alias-border-l2,#e1e1e1);border-radius:12px;background:var(--dsw-alias-bg-layer-2,#fff);overflow:hidden}.rs-result-body{padding:13px;display:grid;gap:12px}.rs-task{margin:0;white-space:pre-wrap;font-size:13px;line-height:1.55}.rs-list{list-style:none;padding:0;margin:0;display:grid;gap:9px}.rs-repo{border:1px solid var(--dsw-alias-border-l2,#e1e1e1);border-radius:10px;padding:11px;display:grid;gap:8px}.rs-repo a{color:var(--dsw-alias-link,#4f46e5);font-weight:650;text-decoration:none;overflow-wrap:anywhere}.rs-repo a:hover{text-decoration:underline}.rs-tags{display:flex;flex-wrap:wrap;gap:5px}.rs-tag{padding:2px 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-3,#f2f2f2);font-size:11px;color:var(--dsw-alias-label-secondary,#686868)}.rs-code{margin:0;max-height:180px;overflow:auto;padding:9px;border-radius:8px;background:var(--dsw-alias-bg-layer-3,#f4f4f4);font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap}.rs-summary{cursor:pointer;padding:11px 13px;font-size:12px;font-weight:650}.rs-history{border-top:1px solid var(--dsw-alias-border-l2,#e1e1e1)}
.rs-tool{border:1px solid var(--dsw-alias-border-l2,#e1e1e1);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#fff);padding:10px 12px}.rs-tool>summary{list-style:none}.rs-tool>summary::-webkit-details-marker{display:none}.rs-tool-row{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer}.rs-header-action{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#686868);padding:6px 8px;border-radius:7px;font:inherit;font-size:12px;cursor:pointer}.rs-header-action:hover{background:var(--dsw-alias-bg-layer-3,#f1f1f1);color:var(--dsw-alias-label-primary,#171717)}
.rs-dialog{border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#171717);padding:18px;width:min(420px,calc(100vw - 32px));box-shadow:0 18px 60px rgba(0,0,0,.22)}.rs-dialog::backdrop{background:rgba(0,0,0,.42)}.rs-dialog form{display:grid;gap:14px}.rs-dialog h3,.rs-dialog p{margin:0}.rs-title-inline{display:flex;align-items:center;gap:6px}.rs-count{font-variant-numeric:tabular-nums}.rs-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:767px){.rs-card{padding:14px}.rs-grid{grid-template-columns:1fr}.rs-actions{align-items:stretch;flex-direction:column}.rs-actions .rs-button{width:100%;min-height:44px}.rs-input,.rs-select{min-height:44px}.rs-header-action{min-height:44px}.rs-panel-scroll{padding:12px}.rs-meta{align-items:flex-start;flex-direction:column}}
@media(prefers-reduced-motion:reduce){.rs-button,.rs-header-action{scroll-behavior:auto;transition:none}}
`

let users = 0

export function installStyles(): () => void {
  users += 1
  if (document.getElementById(STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.append(style)
  }
  return () => {
    users -= 1
    if (users <= 0) {
      users = 0
      document.getElementById(STYLE_ID)?.remove()
    }
  }
}
