// نظام التنقل باللمس والإيماءات والرجوع للخلف للشاشات السابقة
type BackHandler = () => boolean | void;

const handlerStack: BackHandler[] = [];
let isInitialized = false;

/**
 * تسجيل دالة رجوع خاصة بشاشة أو نافذة منبثقة معينة.
 * يتم استدعاؤها أولاً عند محاولة الرجوع.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  handlerStack.push(handler);
  
  // دفع حالة في سجل المتصفح لدعم إيماءات الهواتف الأصلية (Android Back Gesture / Edge Swipe)
  if (typeof window !== 'undefined' && window.history) {
    try {
      window.history.pushState({ appNavLevel: handlerStack.length }, '');
    } catch (_) {}
  }

  return () => {
    const idx = handlerStack.lastIndexOf(handler);
    if (idx !== -1) {
      handlerStack.splice(idx, 1);
    }
  };
}

/**
 * تنفيذ الرجوع للخلف:
 * 1. استدعاء أحدث معالج مسجل في المكدس (مثل إغلاق نافذة منبثقة أو الرجوع لخطوة سابقة).
 * 2. أو البحث التلقائي في الصفحة عن زر "رجوع" أو "السابق" أو "العودة للقائمة الرئيسية" أو زر إغلاق ونقره برمجياً.
 */
export function triggerAppGoBack(): boolean {
  // 1. معالجات المكدس النشطة
  while (handlerStack.length > 0) {
    const handler = handlerStack.pop();
    if (handler) {
      try {
        const result = handler();
        if (result !== false) {
          triggerHapticFeedback();
          return true;
        }
      } catch (err) {
        console.error('Error executing back handler:', err);
      }
    }
  }

  // 2. البحث الذكي عن أزرار الرجوع في الشاشة الحالية
  if (typeof document !== 'undefined') {
    const backKeywords = [
      'رجوع',
      'العودة للقائمة الرئيسية',
      'العودة للقائمة',
      'رجوع للقائمة',
      'السابق',
      'العودة للرئيسية',
      'الرجوع للتعديل',
      'العودة لطلابي'
    ];

    // جلب جميع الأزرار في الواجهة
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button, [role="button"]'));

    // البحث من الأسفل للأعلى (العناصر الأكثر تخصيصاً أو الأحدث في DOM)
    for (let i = buttons.length - 1; i >= 0; i--) {
      const btn = buttons[i];
      // التحقق من أن الزر مرئي وغير معطل
      if (btn.disabled) continue;
      if (btn.offsetWidth === 0 && btn.offsetHeight === 0) continue;
      if (window.getComputedStyle(btn).display === 'none' || window.getComputedStyle(btn).visibility === 'hidden') continue;

      const text = (btn.textContent || '').trim();
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const title = btn.getAttribute('title') || '';

      const isBack = backKeywords.some(keyword => 
        text.includes(keyword) || ariaLabel.includes(keyword) || title.includes(keyword)
      );

      if (isBack) {
        triggerHapticFeedback();
        btn.click();
        return true;
      }
    }

    // 3. البحث عن أزرار إغلاق النوافذ المنبثقة إذا كانت هناك نافذة مفتوحة
    const closeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="إغلاق"], button[title="إغلاق"], button[aria-label="Close"], button[title="Close"]'
    ));
    for (let i = closeButtons.length - 1; i >= 0; i--) {
      const btn = closeButtons[i];
      if (btn.disabled) continue;
      if (btn.offsetWidth === 0 && btn.offsetHeight === 0) continue;
      triggerHapticFeedback();
      btn.click();
      return true;
    }
  }

  return false;
}

function triggerHapticFeedback() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(15);
    } catch (_) {}
  }
}

/**
 * تفعيل خاصية الرجوع للشاشة السابقة باللمس عبر تمرير الإصبع لجهة اليسار
 * بالإضافة لدعم إيماءات الهواتف الأصلية (Edge Swipe / Popstate).
 */
export function initSwipeNavigation() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isTracking = false;

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      isTracking = false;
      return;
    }

    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isTracking = true;
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!isTracking) return;
    isTracking = false;

    if (e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    
    // حساب المسافة الأفقية والعمودية:
    // diffX > 0 تعني أن حركة الإصبع كانت باتجاه اليسار (من اليمين إلى اليسار)
    const diffX = touchStartX - touch.clientX;
    const diffY = touchStartY - touch.clientY;
    const duration = Date.now() - touchStartTime;

    // شروط قبول إيماءة التمرير لليسار:
    // 1. المسافة الأفقية لليسار لا تقل عن 50 بكسل
    // 2. الحركة أفقية بوضوح وليست تمرير رأسي (diffX > |diffY| * 1.3)
    // 3. المدة الزمنية أقل من 650 ميلي ثانية (تمريرة سريعة ومتعمدة)
    if (diffX > 50 && diffX > Math.abs(diffY) * 1.3 && duration < 650) {
      const target = e.target as HTMLElement | null;
      if (target) {
        // تجاهل الحقول النصية وحقول الإدخال لتجنب تداخل تحديد النصوص
        if (target.closest('input, textarea, select, [contenteditable="true"]')) {
          return;
        }

        // تجاهل داخل قارئ المصحف الشريف لأن السحب فيه مخصص لتقليب صفحات المصحف
        if (target.closest('[data-mushaf-reader], .mushaf-container, .mushaf-modal')) {
          return;
        }

        // تجاهل الأشرطة ذات التمرير الأفقي مثل الجداول ما لم تكن في نهاية التمرير
        const scrollable = target.closest('.overflow-x-auto, .overflow-x-scroll') as HTMLElement | null;
        if (scrollable && scrollable.scrollWidth > scrollable.clientWidth + 10) {
          const maxScroll = scrollable.scrollWidth - scrollable.clientWidth;
          if (scrollable.scrollLeft < maxScroll - 20) {
            return;
          }
        }
      }

      // تنفيذ الرجوع للشاشة السابقة
      triggerAppGoBack();
    }
  };

  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });

  // دعم إيماءة الرجوع المدمجة بنظام الهاتف (Android / iOS edge swipe / browser back)
  window.addEventListener('popstate', () => {
    const handled = triggerAppGoBack();
    if (handled) {
      // إعادة دفع حالة لمنع مغادرة التطبيق بالخطأ إذا كانت هناك شاشات أخرى
      try {
        window.history.pushState({ appNavLevel: handlerStack.length }, '');
      } catch (_) {}
    }
  });
}
