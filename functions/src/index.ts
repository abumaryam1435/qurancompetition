import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

admin.initializeApp();

export const convertToPdf = functions
  .runWith({ 
    memory: "2GB", 
    timeoutSeconds: 60 
  })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const { html, orientation = "landscape" } = req.body;
      
      if (!html) {
        res.status(400).send("محتوى HTML مفقود");
        return;
      }

      // إعداد بيئة كروميوم للعمل بسلاسة داخل Firebase Functions
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      
      // تعيين المحتوى مع الانتظار حتى اكتمال تحميل الخطوط والموارد
      await page.setContent(html, { waitUntil: ["networkidle0", "load", "domcontentloaded"] });
      
      // إنشاء ملف PDF بجودة عالية
      const pdfBuffer = await page.pdf({
        format: "A4",
        landscape: orientation === "landscape",
        printBackground: true,
        preferCSSPageSize: true, // يأخذ بعين الاعتبار @page 
        margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" }
      });

      await browser.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="report.pdf"');
      res.status(200).send(pdfBuffer);
      
    } catch (error) {
      console.error("Error creating PDF:", error);
      res.status(500).send("Internal Server Error: " + (error as Error).message);
    }
  });
