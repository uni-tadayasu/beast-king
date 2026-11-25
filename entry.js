/** Title and player-name entry screen. All state and interactions are owned by app.js. */
export function entryView({ playerName = '', profileOrigin = 'mountain', starterId = '', starters = [], ELEMENTS = [], esc, icon, musicButton } = {}) {
  const escape = typeof esc === 'function' ? esc : value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const glyph = name => typeof icon === 'function' ? icon(name) : '';
  const audioControl = typeof musicButton === 'function' ? musicButton() : '';
  const originOrder = ['mountain', 'river', 'seed', 'grass', 'flower', 'tree', 'king'];
  const originNames = { mountain: '山', river: '川', seed: '種', grass: '草', flower: '花', tree: '木', king: '王' };
  const origins = originOrder.map(id => (Array.isArray(ELEMENTS) && ELEMENTS.find(e => e.id === id)) || { id, name: originNames[id] });
  const selectedOrigin = originOrder.includes(profileOrigin) ? profileOrigin : 'mountain';
  const profileChoices = origins.map(e => `<button type="button" class="entry-profile-option${e.id === selectedOrigin ? ' selected' : ''}" data-action="profile-origin" data-origin="${e.id}" aria-pressed="${e.id === selectedOrigin}" aria-label="${escape(e.name + 'のプロフィールアイコン')}"><img src="assets/profiles/${e.id}.svg" alt="" width="40" height="40"><span>${escape(e.name)}</span></button>`).join('');
  return `<main id="main" class="entry-screen" aria-labelledby="entry-title" tabindex="-1">
    <div class="entry-scene" aria-hidden="true"></div>
    <div class="entry-vignette" aria-hidden="true"></div>
    <header class="entry-header">
      <div class="entry-mark" aria-hidden="true"><img src="assets/design-v2/brand/crest.svg" alt="" width="46" height="46"><span>THE ART OF STRATEGY</span></div>
      <div class="entry-audio">${audioControl}</div>
    </header>
    <div class="entry-layout">
      <section class="entry-content">
        <div class="entry-edition"><span class="entry-edition-star" aria-hidden="true">${glyph('spark')}</span><span>第五弾「幻彩の夢界」登場 <span class="entry-edition-dot" aria-hidden="true">·</span> <span class="entry-card-total">4,721 CARDS</span></span></div>
        <h1 id="entry-title" class="entry-title"><span class="entry-title-en" lang="en">BEAST KING</span><span class="entry-title-ja">ビーストキング</span></h1>
        <p class="entry-invitation">魔獣と出会い、君だけの王道を。</p>
        <form id="entry-start-form" class="entry-start-panel" novalidate>
          <div class="entry-name-heading"><label for="entry-player-name">プレイヤー名</label><span id="entry-name-help">必須 · 1〜16文字</span></div>
          <div class="entry-input-wrap"><span class="entry-input-mark" aria-hidden="true">${glyph('crown')}</span><input id="entry-player-name" name="playerName" type="text" value="${escape(String(playerName ?? ''))}" maxlength="16" minlength="1" required autocomplete="nickname" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="あなたの名前" aria-describedby="entry-name-help entry-name-note" enterkeyhint="go"></div>
          <p id="entry-name-error" class="entry-name-error" role="alert" hidden></p>
          <div class="entry-profile-picker"><p id="entry-profile-label">プロフィールアイコン</p><div class="entry-profile-options" role="group" aria-labelledby="entry-profile-label">${profileChoices}</div></div>
          <div class="entry-starter-choice"><label for="entry-starter">最初のスターターデッキ（1種類無料）</label><select id="entry-starter" data-change="entry-starter" name="starter" aria-label="最初のスターターデッキ">${starters.map((d,i)=>`<option value="${escape(d.id)}"${d.id===starterId||(!starterId&&i===0)?' selected':''}>${escape(d.name)}</option>`).join('')}</select><small>通常32枚＋特殊4枚。残りはショップで購入できます。</small></div>
          <button class="entry-start-button" type="button" data-action="name-start"><span aria-hidden="true">${glyph('sword')}</span><span>開始</span></button>
          <p id="entry-name-note" class="entry-name-note">登録は初回だけ。名前とアイコンは設定で変更できます。</p>
        </form>
        <div class="entry-deck-rule" aria-label="通常デッキ32枚、特殊デッキ4枚"><span>${glyph('cards')}通常デッキ <b>32</b> 枚</span><span class="entry-rule-divider" aria-hidden="true"></span><span>${glyph('fusion')}特殊デッキ <b>4</b> 枚</span></div>
      </section>
      <div class="entry-art-caption" aria-hidden="true"><span class="entry-art-line"></span><span>王冠は、その一手を待っている。<small>EVERY MOVE, A LEGACY.</small></span></div>
    </div>
    <footer class="entry-footer"><span>PC · スマホ · タブレット</span><a href="about.html">ゲーム紹介・遊び方</a><span>© 2026 Beast King</span></footer>
  </main>`;
}
