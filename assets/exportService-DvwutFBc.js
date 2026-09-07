import{v as b,_ as m,G as h}from"./index-Oga7gqdV.js";import y from"./purify.es-Jn2rvFN8.js";const g=/oklch|oklab|lch\(|lab\(|color-mix|color\(/i,i=(o,n)=>!o||o==="none"||g.test(o)?n:o,u=(o,n)=>{const r=(t,e)=>{if(t instanceof HTMLElement&&e instanceof HTMLElement){const l=window.getComputedStyle(t);e.style.color=i(l.color,"#0f172a"),e.style.backgroundColor=i(l.backgroundColor,"transparent"),e.style.backgroundImage="none",e.style.boxShadow="none",e.style.textShadow="none",e.style.filter="none",e.style.backdropFilter="none",e.style.borderTopColor=i(l.borderTopColor,"transparent"),e.style.borderRightColor=i(l.borderRightColor,"transparent"),e.style.borderBottomColor=i(l.borderBottomColor,"transparent"),e.style.borderLeftColor=i(l.borderLeftColor,"transparent"),e.style.outlineColor=i(l.outlineColor,"transparent"),e.style.textDecorationColor=i(l.textDecorationColor,e.style.color)}const a=t.children,c=e.children;for(let l=0;l<a.length&&l<c.length;l++)r(a[l],c[l])};r(o,n)},x=(o,n)=>{const r=Math.max(1,o),t=Math.max(1,n),e=4096,a=16777216,c=Math.min(e/r,e/t),l=Math.sqrt(a/(r*t));return Math.max(1,Math.min(2,c,l))},w=(o,n)=>{const r=URL.createObjectURL(o),t=document.createElement("a");t.href=r,t.download=n,t.rel="noopener",document.body.appendChild(t),t.click(),document.body.removeChild(t),window.setTimeout(()=>URL.revokeObjectURL(r),2500)},v={saveAsExcel:(o,n,r)=>{const t=`
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <style>
                    table { border-collapse: collapse; font-family: Arial, sans-serif; width: 100%; }
                    th, td { border: 1px solid #000; padding: 5px; text-align: left; vertical-align: middle; }
                    .header { background-color: #f3f4f6; font-weight: bold; text-align: center; }
                    .title-main { font-size: 18pt; font-weight: bold; text-align: center; border: none; }
                    .title-sub { font-size: 12pt; text-align: center; border: none; }
                    .approval-block { text-align: left; border: none !important; font-family: "Times New Roman", serif; font-size: 11pt; }
                    .footer-block { border: none !important; font-weight: bold; text-align: left; padding-top: 20px; font-size: 11pt; font-family: "Times New Roman", serif; }
                    .empty-row { border: none !important; height: 15px; }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: bold; }
                    ${r||""}
                </style>
            </head>
            <body>
                ${o}
            </body>
            </html>
        `,e=new Blob(["\uFEFF"+t],{type:"text/html;charset=utf-8"}),a=URL.createObjectURL(e),c=document.createElement("a");c.href=a,c.download=n.endsWith(".xls")?n:`${n}.xls`,document.body.appendChild(c),c.click(),document.body.removeChild(c),URL.revokeObjectURL(a)},saveAsCSV:(o,n,r="csv")=>{const t=new Blob([o],{type:r==="csv"?"text/csv":"text/tab-separated-values"}),e=URL.createObjectURL(t),a=document.createElement("a");a.href=e,a.download=n.endsWith(`.${r}`)?n:`${n}.${r}`,document.body.appendChild(a),a.click(),document.body.removeChild(a),URL.revokeObjectURL(e)},captureAndDownloadPng:async(o,n)=>{const{default:r}=await m(async()=>{const{default:e}=await import("./html2canvas.esm-QH1iLAAe.js");return{default:e}},[]),t=o.cloneNode(!0);u(o,t),t.style.position="fixed",t.style.left="-12000px",t.style.top="0",t.style.zIndex="-1",t.style.margin="0",t.style.backgroundColor="#ffffff",t.style.boxShadow="none",t.style.width=`${Math.max(o.scrollWidth,o.offsetWidth,800)}px`,t.style.maxWidth="none",document.body.appendChild(t);try{const e=x(t.scrollWidth||800,t.scrollHeight||600),a=await r(t,{scale:e,backgroundColor:"#ffffff",logging:!1,useCORS:!0,allowTaint:!1,foreignObjectRendering:!1,onclone:(s,d)=>{d.style.backgroundColor="#ffffff",d.style.boxShadow="none"}}),c=await new Promise((s,d)=>{a.toBlob(f=>f?s(f):d(new Error("toBlob returned empty")),"image/png")}),l=new File([c],n,{type:"image/png"}),p=typeof navigator.share=="function"&&typeof navigator.canShare=="function"&&navigator.canShare({files:[l]});if(h()&&p)try{await navigator.share({files:[l],title:n});return}catch(s){if(s.name==="AbortError")return;b.warn("Share failed, falling back to download",s)}w(c,n)}finally{t.remove()}},copyToClipboard:async o=>{try{return await navigator.clipboard.writeText(o),!0}catch(n){return b.error("Failed to copy text: ",n),!1}},getApprovalBlock:(o=new Date().getFullYear())=>`
        <table>
            <tr>
                <td colspan="2" style="border:none"></td>
                <td colspan="2" class="approval-block">
                    <b>УТВЕРЖДАЮ</b><br>
                    Директор государственного<br>
                    учреждения образования<br>
                    «Гимназия № 22 г. Минска»<br><br>
                    __________ Н.В.Кисель<br>
                    "__" ______ ${o}г.
                </td>
            </tr>
            <tr class="empty-row"><td colspan="4" style="border:none"></td></tr>
        </table>
    `,printHTML:(o,n="Document")=>{const r=window.open("","_blank");if(!r)return!1;const t=y.sanitize(o,{USE_PROFILES:{html:!0}});return r.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${n}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    th { background-color: #f0f0f0; font-weight: bold; }
                    .text-center { text-align: center; }
                    h1 { text-align: center; margin-bottom: 20px; }
                    @media print {
                        @page { margin: 1cm; }
                    }
                </style>
            </head>
            <body>
                ${t}
            </body>
            </html>
        `),r.document.close(),r.focus(),setTimeout(()=>{r.print(),r.close()},250),!0}};export{v as e};
