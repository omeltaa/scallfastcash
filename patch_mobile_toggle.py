# patch_mobile_toggle.py
# Ajoute un bouton "📱 Mobile" qui bascule un mode mobile optimisé
# - Injection *non destructive* : ne modifie rien d'existant, ajoute seulement du HTML/CSS/JS
# - Sûr en re-exécution : ne duplique pas le bouton ni les styles/scripts
import re, io

PATH = "index.html"
with io.open(PATH, "r", encoding="utf-8", errors="ignore") as f:
    html = f.read()

changed = False

# 1) Bouton dans la topbar (zone .top-right)
if 'id="toggleMobile"' not in html:
    html = re.sub(
        r'(<div\s+class="top-right"\s*>)',
        r'\1\n    <button class="btn" id="toggleMobile" aria-pressed="false" title="Basculer l’affichage mobile">📱 Mobile</button>',
        html, count=1, flags=re.IGNORECASE
    )
    changed = True

# 2) Styles ajoutés (scopés à body.mobile-mode)
if 'id="mobile-toggle-styles"' not in html:
    mobile_css = """
  <style id="mobile-toggle-styles">
    /* === Mode Mobile forcé (via bouton) === */
    body.mobile-mode .topbar{grid-template-columns:1fr;row-gap:8px}
    body.mobile-mode .top-left, 
    body.mobile-mode .top-center, 
    body.mobile-mode .top-right{justify-self:stretch}
    body.mobile-mode .top-right{display:flex;flex-wrap:wrap;gap:8px}
    body.mobile-mode .logo-img{max-height:28px}

    /* Grilles principales en 1 colonne */
    body.mobile-mode .board{grid-template-columns:1fr !important}
    body.mobile-mode .kitchen{display:grid;grid-template-columns:1fr !important;gap:12px}
    body.mobile-mode .kpis{grid-template-columns:1fr 1fr !important}
    @media (max-width:480px){
      body.mobile-mode .kpis{grid-template-columns:1fr !important}
    }

    /* Cartes compactes et clic plus facile */
    body.mobile-mode .col{min-height:auto}
    body.mobile-mode .card{margin:8px 0;padding:10px;border-radius:12px}
    body.mobile-mode .btn{padding:10px 12px;font-size:14px;border-radius:10px}
    body.mobile-mode input, 
    body.mobile-mode select, 
    body.mobile-mode textarea{min-height:42px}

    /* Éditeur de lignes en colonne */
    body.mobile-mode #lineBuilder{grid-template-columns:1fr !important}
    body.mobile-mode .lines-grid{grid-template-columns:1fr !important}
    body.mobile-mode .lines-grid > *{min-height:42px}
  </style>
"""
    # injecte avant </head>
    html = re.sub(r'</head>', mobile_css + '\n</head>', html, count=1, flags=re.IGNORECASE)
    changed = True

# 3) Script de bascule
if 'id="mobile-toggle-script"' not in html:
    mobile_js = """
<script id=\"mobile-toggle-script\">
(function(){
  var btn = document.getElementById('toggleMobile');
  if(!btn) return;
  var CLS = 'mobile-mode';
  function sync(){
    var on = document.body.classList.contains(CLS);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '📱 Mobile ON' : '📱 Mobile';
  }
  btn.addEventListener('click', function(){
    document.body.classList.toggle(CLS);
    sync();
    try{
      if (window.renderBoard) window.renderBoard();
      if (window.renderKitchen) window.renderKitchen();
    }catch(e){}
  });
  // Restaure l'état depuis localStorage si besoin
  try{
    var saved = localStorage.getItem('scallorder.mobileMode');
    if (saved === '1'){ document.body.classList.add(CLS); }
  }catch(e){}
  // Persistance on change
  new MutationObserver(function(){
    try{
      var on = document.body.classList.contains(CLS);
      localStorage.setItem('scallorder.mobileMode', on ? '1' : '0');
    }catch(e){}
  }).observe(document.body, {attributes:true, attributeFilter:['class']});
  sync();
})();
</script>
"""
    # injecte avant </body>
    html = re.sub(r'</body>', mobile_js + '\n</body>', html, count=1, flags=re.IGNORECASE)
    changed = True

if changed:
    with io.open(PATH, "w", encoding="utf-8") as f:
        f.write(html)
    print("✅ Bouton '📱 Mobile' + styles/scripts ajoutés.")
else:
    print("ℹ️ Rien à faire : le bouton et les styles/scripts semblent déjà présents.")
