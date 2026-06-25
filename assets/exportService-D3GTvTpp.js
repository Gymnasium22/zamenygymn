import i from"./purify.es-Csrj9YNg.js";import{t as c}from"./index-BTSjuIg6.js";const b={saveAsExcel:(o,e,t)=>{const r=`
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
                    ${t||""}
                </style>
            </head>
            <body>
                ${o}
            </body>
            </html>
        `,a=new Blob(["\uFEFF"+r],{type:"text/html;charset=utf-8"}),n=URL.createObjectURL(a),l=document.createElement("a");l.href=n,l.download=e.endsWith(".xls")?e:`${e}.xls`,document.body.appendChild(l),l.click(),document.body.removeChild(l),URL.revokeObjectURL(n)},saveAsCSV:(o,e,t="csv")=>{const r=new Blob([o],{type:t==="csv"?"text/csv":"text/tab-separated-values"}),a=URL.createObjectURL(r),n=document.createElement("a");n.href=a,n.download=e.endsWith(`.${t}`)?e:`${e}.${t}`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(a)},copyToClipboard:async o=>{try{return await navigator.clipboard.writeText(o),!0}catch(e){return c.error("Failed to copy text: ",e),!1}},getApprovalBlock:(o=new Date().getFullYear())=>`
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
    `,printHTML:(o,e="Document")=>{const t=window.open("","_blank");if(!t)return!1;const r=i.sanitize(o,{USE_PROFILES:{html:!0}});return t.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${e}</title>
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
                ${r}
            </body>
            </html>
        `),t.document.close(),t.focus(),setTimeout(()=>{t.print(),t.close()},250),!0}};export{b as e};
