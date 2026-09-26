// Styles for every 80mm print document (receipt, bill, kitchen ticket,
// invoice) — injected into the hidden print iframe by printShared.printHtml.
export const RECEIPT_CSS = `
@font-face {
  font-family: "Receipt Mono";
  src: url("/fonts/receipt-mono.woff") format("woff");
  font-weight: 100 900;
  font-display: block;
}
.rcpt {
  width: 80mm;
  padding: 3mm 3.5mm 5mm;
  box-sizing: border-box;
  font-family: "Receipt Mono", "Consolas", "Lucida Console", "Menlo", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.28;
  color: #000;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rcpt * { box-sizing: border-box; }
.rc-name { text-align: center; font-size: 19px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; line-height: 1.15; overflow-wrap: anywhere; padding: 2mm 0 1mm; }
.rc-kv { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; }
.rc-kv > .k { white-space: nowrap; }
.rc-kv > .v { text-align: right; overflow-wrap: anywhere; }
/* Pay to: spans the whole width. The accounts come as pre-packed lines
   (payToLines); the block is pushed right like every other value and is as
   wide as its longest line, so wrapped lines start under the first account. */
.rc-payto { grid-column: 1 / -1; display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: start; }
.rc-payto > .k { white-space: nowrap; }
.rc-accs { justify-self: end; display: flex; flex-direction: column; min-width: 0; max-width: 100%; text-align: left; }
.rc-acc { white-space: pre-wrap; overflow-wrap: anywhere; }
/* Two papers in one print job (e.g. kitchen ticket + bill): a new page each. */
.rc-pagebreak { break-before: page; page-break-before: always; height: 0; }
.rc-rule { border-top: 1px dashed #000; margin: 5px 0; }
.rc-rule.solid { border-top-style: solid; }
.rc-cols, .rc-item { display: grid; grid-template-columns: 3ch 1fr auto; column-gap: 6px; }
.rc-cols { font-weight: 700; }
.rc-cols > :last-child, .rc-item .a { text-align: right; }
.rc-item { align-items: start; }
.rc-item .n { overflow-wrap: anywhere; }
.rc-item .a { white-space: nowrap; }
.rc-item .mod { display: block; font-size: 10.5px; }
.rc-sum { display: flex; justify-content: space-between; gap: 8px; }
.rc-total { display: flex; justify-content: space-between; gap: 8px; font-size: 17px; font-weight: 800; padding: 1mm 0; }
.rc-center { text-align: center; margin-top: 2mm; }
.rc-status { text-align: center; font-weight: 800; letter-spacing: .06em; margin-top: 3px; }
/* Customer papers (receipt, bill, invoice): a little air between lines. */
.rc-airy { line-height: 1.4; }
.rc-airy .rc-item + .rc-item { margin-top: 3px; }
.rc-airy .rc-sum { margin: 1px 0; }
/* The developer's credit under the footer. */
.rc-credit { text-align: center; font-size: 9.5px; margin-top: 2mm; }
/* Kitchen ticket */
.kt-band { border: 2px solid #000; text-align: center; font-weight: 800; font-size: 15px; letter-spacing: .08em; padding: 2px 0; margin-bottom: 4px; }
.kt-meta { font-size: 12px; }
.kt-item { font-size: 15px; font-weight: 700; line-height: 1.25; padding: 3px 0; border-bottom: 1px dashed #000; overflow-wrap: anywhere; }
.kt-item:last-child { border-bottom: 0; }
.kt-item .mod { display: block; font-size: 12px; font-weight: 400; }
`;
