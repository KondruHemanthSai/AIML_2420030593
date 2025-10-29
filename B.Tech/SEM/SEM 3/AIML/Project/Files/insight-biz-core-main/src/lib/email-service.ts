// Email service for sending order receipts
// Uses EmailJS for client-side email sending (no backend required)
// Alternative: Can be integrated with SendGrid, Resend, or Supabase Edge Functions

interface OrderDetails {
  orderNumber: number;
  billDate: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
}

/**
 * Send order receipt via email
 * Uses EmailJS service (client-side) or backend API
 */
export const sendOrderReceiptEmail = async (
  email: string,
  orderDetails: OrderDetails
): Promise<boolean> => {
  try {
    // Try EmailJS first (client-side, easier setup)
    const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    // Check if values are "undefined" as strings (common mistake)
    const hasValidServiceId = EMAILJS_SERVICE_ID && EMAILJS_SERVICE_ID !== "undefined" && EMAILJS_SERVICE_ID !== "your_emailjs_service_id_here";
    const hasValidTemplateId = EMAILJS_TEMPLATE_ID && EMAILJS_TEMPLATE_ID !== "undefined" && EMAILJS_TEMPLATE_ID !== "your_emailjs_template_id_here";
    const hasValidPublicKey = EMAILJS_PUBLIC_KEY && EMAILJS_PUBLIC_KEY !== "undefined" && EMAILJS_PUBLIC_KEY !== "your_emailjs_public_key_here";

    if (hasValidServiceId && hasValidTemplateId && hasValidPublicKey) {
      if (process.env.NODE_ENV === "development") {
        console.log("✅ Using EmailJS for email sending");
      }
      // Use EmailJS if configured
      return await sendViaEmailJS(email, orderDetails);
    } else {
      if (process.env.NODE_ENV === "development") {
        console.warn("⚠️ EmailJS not fully configured, falling back to backend");
      }
      // Fallback to backend API if available
      return await sendViaBackend(email, orderDetails);
    }
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

/**
 * Send email via EmailJS (client-side)
 */
const sendViaEmailJS = async (email: string, orderDetails: OrderDetails): Promise<boolean> => {
  try {
    // Dynamically load EmailJS SDK - handle if package is not installed
    let emailjs: any;
    try {
      const emailjsModule = await import("@emailjs/browser");
      // Handle both default and named exports
      emailjs = emailjsModule.default || emailjsModule;
    } catch (importError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("EmailJS package not installed. Install it with: npm install @emailjs/browser");
        console.warn("Falling back to backend email service...");
      }
      return await sendViaBackend(email, orderDetails);
    }
    
    const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    // Verify all EmailJS config is present
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      if (process.env.NODE_ENV === "development") {
        console.warn("EmailJS environment variables not configured. Falling back to backend email service...");
      }
      return await sendViaBackend(email, orderDetails);
    }

    const emailContent = formatOrderEmail(orderDetails);
    const plainText = formatOrderEmailPlainText(orderDetails);
    
    // Create formatted items text for display
    const formattedItems = orderDetails.items
      .map((item, index) => `${index + 1}. ${item.name} - Qty: ${item.quantity} × ₹${item.price.toFixed(2)} = ₹${item.total.toFixed(2)}`)
      .join("\n");

    // Prepare template parameters for EmailJS
    // Match the exact variable names expected by the EmailJS template
    const templateParams: any = {
      // Basic order info (matching template fields)
      order_number: orderDetails.orderNumber.toString(),
      order_id: orderDetails.orderNumber.toString(),
      email: email,
      to_email: email,
      
      // Cost breakdown - Your template uses {{cost.tax}} format
      // EmailJS requires dot notation in quotes for nested properties
      "cost.tax": orderDetails.tax.toFixed(2),
      "cost.shipping": "0.00",
      "cost.total": orderDetails.total.toFixed(2),
      
      // Also send as flat variables - send NUMBERS ONLY (template adds ₹ symbol)
      tax: orderDetails.tax.toFixed(2),
      shipping: "0.00",
      total: orderDetails.total.toFixed(2),
      subtotal: orderDetails.subtotal.toFixed(2),
      
      // IMPORTANT: EmailJS doesn't support Handlebars loops ({{#orders}})
      // Solution: Use {{email_content}} which contains the complete formatted bill
      // OR create orders_html as plain HTML string (escaping curly braces)
      orders_html: orderDetails.items
        .map((item) => {
          // Escape any potential template-like syntax in item names
          const safeName = item.name.replace(/\{\{|\}\}/g, '');
          return `
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr style="vertical-align: top">
              <td style="padding: 24px 8px 0 4px; display: inline-block; width: max-content">
                <div style="height: 64px; width: 64px; background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; color: #999;">No Image</div>
              </td>
              <td style="padding: 24px 8px 0 8px; width: 100%">
                <div style="font-weight: 500;">${safeName}</div>
                <div style="font-size: 14px; color: #888; padding-top: 4px">QTY: ${item.quantity}</div>
              </td>
              <td style="padding: 24px 4px 0 0; white-space: nowrap">
                <strong>₹${item.total.toFixed(2)}</strong>
              </td>
            </tr>
          </table>
          `;
        })
        .join(""),
      
      // Plain text items list (fallback) - escape curly braces to avoid EmailJS parsing issues
      items: orderDetails.items
        .map((item, index) => {
          const safeName = item.name.replace(/\{\{|\}\}/g, '');
          return `${index + 1}. ${safeName} - Qty: ${item.quantity} × ₹${item.price.toFixed(2)} = ₹${item.total.toFixed(2)}`;
        })
        .join("\n"),
      
      // For single item display (first item only, since loops don't work)
      name: orderDetails.items[0]?.name || "",
      units: orderDetails.items[0]?.quantity.toString() || "",
      price: orderDetails.items[0] ? orderDetails.items[0].price.toFixed(2) : "",
      image_url: "",
      
      // Full HTML content - Escape ALL curly braces to prevent EmailJS corruption error
      // EmailJS will try to parse {{ }} in the HTML, so we escape them all
      email_content: emailContent
        .replace(/\{\{/g, '&#123;&#123;') // Replace {{ with HTML entities
        .replace(/\}\}/g, '&#125;&#125;') // Replace }} with HTML entities
        .replace(/\{/g, '&#123;')  // Also escape single {
        .replace(/\}/g, '&#125;'), // Also escape single }
      plain_text: plainText.replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;'),
      
      // Additional info
      bill_date: orderDetails.billDate,
      subject: `Order Receipt - Order #${orderDetails.orderNumber}`,
    };

    if (process.env.NODE_ENV === "development") {
      console.log("📧 Sending email via EmailJS", {
        to: email,
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        params_keys: Object.keys(templateParams),
      });
    }
    if (process.env.NODE_ENV === "development") {
      console.log("📋 Sample values being sent:", {
        order_id: templateParams.order_id,
        tax: templateParams.tax,
        total: templateParams.total,
        items_preview: formattedItems.substring(0, 100) + "...",
      });
    }

    // Use EmailJS send method - handle both send and sendForm
    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      templateParams,
      EMAILJS_PUBLIC_KEY
    );

    if (process.env.NODE_ENV === "development") {
      console.log("✅ Email sent successfully via EmailJS");
    }
    return true;
  } catch (error: any) {
    console.error("EmailJS error:", error);
    if (process.env.NODE_ENV === "development") {
      console.error("Error details:", {
        message: error?.text || error?.message,
        status: error?.status,
      });
      console.log("Attempting fallback to backend email service...");
    }
    return await sendViaBackend(email, orderDetails);
  }
};

/**
 * Send email via backend API
 */
const sendViaBackend = async (email: string, orderDetails: OrderDetails): Promise<boolean> => {
  try {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
    const emailContent = formatOrderEmail(orderDetails);

    const response = await fetch(`${API_BASE_URL}/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: email,
        subject: `Order Receipt - Order #${orderDetails.orderNumber}`,
        html: emailContent,
        text: formatOrderEmailPlainText(orderDetails),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send email: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error("Backend email error:", error);
    // If backend is not available, return false (order still completes)
    return false;
  }
};

/**
 * Format order details as HTML email - Complete Bill Copy
 * Escapes curly braces to prevent EmailJS from treating them as template variables
 */
const formatOrderEmail = (order: OrderDetails): string => {
  // Helper function to escape curly braces in strings so EmailJS doesn't parse them
  const escapeBraces = (str: string): string => {
    if (!str) return '';
    return String(str).replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;');
  };
  const itemsHtml = order.items
    .map(
      (item, index) => {
        // Escape product names to prevent EmailJS template parsing issues
        const safeName = escapeBraces(item.name);
        return `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 8px; vertical-align: top;">${index + 1}.</td>
      <td style="padding: 12px 8px; font-weight: 500;">${safeName}</td>
      <td style="padding: 12px 8px; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px 8px; text-align: right;">₹${item.price.toFixed(2)}</td>
      <td style="padding: 12px 8px; text-align: right; font-weight: 600;">₹${item.total.toFixed(2)}</td>
    </tr>
  `;
      }
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: 'Segoe UI', Arial, sans-serif; 
          line-height: 1.6; 
          color: #1f2937; 
          background-color: #f9fafb;
          margin: 0;
          padding: 20px;
        }
        .email-container { 
          max-width: 600px; 
          margin: 0 auto; 
          background-color: #ffffff;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header { 
          text-align: center; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 30px 20px; 
          color: #ffffff;
        }
        .logo { 
          font-size: 28px; 
          font-weight: bold; 
          margin-bottom: 5px;
          letter-spacing: 1px;
        }
        .logo-subtitle {
          font-size: 14px;
          opacity: 0.9;
          margin-top: 5px;
        }
        .bill-header {
          padding: 25px 20px;
          background-color: #ffffff;
          border-bottom: 2px solid #e5e7eb;
        }
        .bill-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .bill-title {
          font-size: 22px;
          font-weight: bold;
          color: #111827;
          margin-bottom: 15px;
          text-align: center;
          padding-bottom: 15px;
          border-bottom: 2px solid #e5e7eb;
        }
        .bill-details {
          padding: 0 20px;
          margin: 20px 0;
        }
        .bill-detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }
        .bill-detail-label {
          color: #6b7280;
          font-weight: 500;
        }
        .bill-detail-value {
          color: #111827;
          font-weight: 600;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 25px 0;
          background-color: #ffffff;
        }
        thead {
          background-color: #f3f4f6;
        }
        th { 
          padding: 12px 8px; 
          text-align: left; 
          font-weight: 700;
          font-size: 13px;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #e5e7eb;
        }
        th:nth-child(3),
        th:nth-child(4),
        th:nth-child(5) {
          text-align: right;
        }
        tbody tr:hover {
          background-color: #f9fafb;
        }
        .summary-section {
          padding: 20px;
          background-color: #f9fafb;
          border-top: 2px solid #e5e7eb;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          font-size: 15px;
        }
        .summary-label {
          color: #6b7280;
          font-weight: 500;
        }
        .summary-value {
          color: #111827;
          font-weight: 600;
        }
        .total-row {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 2px solid #d1d5db;
          font-size: 18px;
          font-weight: bold;
        }
        .total-label {
          color: #111827;
        }
        .total-value {
          color: #059669;
          font-size: 20px;
        }
        .footer { 
          margin-top: 0;
          padding: 25px 20px;
          background-color: #f9fafb;
          text-align: center; 
          color: #6b7280; 
          font-size: 13px;
          border-top: 2px solid #e5e7eb;
        }
        .footer-message {
          margin: 10px 0;
          font-weight: 500;
          color: #374151;
        }
        .divider {
          height: 1px;
          background-color: #e5e7eb;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <div class="header">
          <div class="logo">
            <span style="font-size: 24px; font-weight: bold; color: #2563eb;">FutureKart</span>
          </div>
          <div class="logo-subtitle">Order Receipt / Bill Copy</div>
        </div>

        <!-- Bill Header -->
        <div class="bill-header">
          <div class="bill-title">📋 BILL DETAILS</div>
          <div class="bill-details">
            <div class="bill-detail-row">
              <span class="bill-detail-label">Order Number:</span>
              <span class="bill-detail-value">#${escapeBraces(String(order.orderNumber))}</span>
            </div>
            <div class="bill-detail-row">
              <span class="bill-detail-label">Bill Date & Time:</span>
              <span class="bill-detail-value">${escapeBraces(order.billDate)}</span>
            </div>
            <div class="bill-detail-row">
              <span class="bill-detail-label">Total Items:</span>
              <span class="bill-detail-value">${order.items.length} item${order.items.length > 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        <!-- Items Table -->
        <div style="padding: 0 20px;">
          <h3 style="margin: 20px 0 15px 0; color: #374151; font-size: 16px;">ITEMS PURCHASED:</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 40%;">Item Name</th>
                <th style="width: 15%;">Qty</th>
                <th style="width: 20%;">Unit Price</th>
                <th style="width: 20%;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>

        <!-- Summary Section -->
        <div class="summary-section">
          <div class="summary-row">
            <span class="summary-label">Subtotal:</span>
            <span class="summary-value">₹${escapeBraces(String(order.subtotal.toFixed(2)))}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">GST (5%):</span>
            <span class="summary-value">₹${escapeBraces(String(order.tax.toFixed(2)))}</span>
          </div>
          <div class="divider"></div>
          <div class="summary-row total-row">
            <span class="total-label">GRAND TOTAL:</span>
            <span class="total-value">₹${escapeBraces(String(order.total.toFixed(2)))}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-message">✓ This is your official bill/receipt copy</div>
          <p style="margin: 5px 0;">Please keep this email for your records and warranty purposes.</p>
          <p style="margin: 15px 0 5px 0; font-weight: 600;">Thank you for shopping with us! 🎉</p>
          <p style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 12px;">
            This is an automated email. For any queries, please contact our support team.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Format order details as plain text email (fallback) - Complete Bill Copy
 */
const formatOrderEmailPlainText = (order: OrderDetails): string => {
  const itemsText = order.items
    .map((item, index) => `${index + 1}. ${item.name}\n   Quantity: ${item.quantity} × ₹${item.price.toFixed(2)} = ₹${item.total.toFixed(2)}`)
    .join("\n\n");

  return `
═══════════════════════════════════════════
    FutureKart - ORDER RECEIPT
═══════════════════════════════════════════

BILL DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order Number: #${order.orderNumber}
Bill Date: ${order.billDate}
Total Items: ${order.items.length} item${order.items.length > 1 ? 's' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ITEMS PURCHASED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${itemsText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BILL SUMMARY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subtotal:        ₹${order.subtotal.toFixed(2)}
GST (5%):        ₹${order.tax.toFixed(2)}
───────────────────────────────────────────
GRAND TOTAL:     ₹${order.total.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is your official bill/receipt copy.
Please keep this email for your records.

Thank you for shopping with FutureKart!

═══════════════════════════════════════════
  `.trim();
};

