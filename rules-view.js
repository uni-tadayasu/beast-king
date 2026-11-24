const CHAPTERS = Object.freeze([
  {
    id: 'basics', label: '基本', heading: '最初の一戦を始める', summary: '勝利条件と、自分のターンにできること。',
    panels: [
      { title: '勝敗とデッキ', icon: 'cards', rows: [
        ['勝利条件', 'ハートポイント5,000で開始。相手を0にすると勝利し、同時に0になった場合は引き分けです。'],
        ['デッキ', '通常デッキ32枚＋特殊デッキ4枚の計36枚。同名カードは各2枚まで。特殊デッキには合成魔獣を入れ、対戦開始時に特殊ゾーンへ置きます。'],
        ['山札切れ', '山札が空の状態で引こうとすると、疲弊でハートポイントに100、200、300…と増えるダメージを受けます。'],
        ['操作', 'マウスのクリック・画面のタップで操作できます。対象が光ったら、使いたい相手や味方を選びます。'],
      ] },
      { title: '自分のターン', icon: 'spark', rows: [
        ['エーテル', '毎ターン全回復し、上限は10。先攻は1→2→3…、後攻は最初の2ターンに+1され、2→3→3→4…と増えます。カード左上のコスト分を消費します。'],
        ['手札', '初期手札・手札上限は4枚。自分のターン開始時に4枚まで山札から補充し、4枚なら引きません。カード効果によるドローも4枚が上限です。'],
        ['場の上限', '出場ゾーンの魔獣は4体、設置できるギミックは2枚までです。'],
        ['魔獣の行動', 'エーテルを使って召喚し、各ターンに1回攻撃できます。通常は、召喚した次の自分のターンから攻撃可能です。'],
      ] },
    ],
  },
  {
    id: 'cards', label: 'カード', heading: '四つのカードを使い分ける', summary: 'カードはすべて縦向き。種類ごとに役割と配置が変わります。',
    panels: [
      { title: 'カードの種類', icon: 'beast', rows: [
        ['通常魔獣', '攻撃力と守備力を持つ、アタック型・ディフェンス型のカード。第一弾〜第四弾に各512枚、合計2,048枚を収録しています。'],
        ['ミラクル', '威力カード・再生カードの計1,024枚。「合成」は再生カードです。使用時にダメージ・強化・回復などを発揮。対象が必要なら、発動後に光る相手や味方を選びます。'],
        ['ギミック', '反射カード・魔獣サポートカードの計1,024枚。相手の攻撃や次の自分のターンに自動で発動し、それまでは相手にカード名を見せません。'],
        ['合成魔獣', '特殊デッキに入る512枚。ミラクル「合成」で特殊ゾーンから召喚する、アタック・ディフェンス型の魔獣です。'],
      ] },
      { title: '場での配置', icon: 'book', rows: [
        ['アタック型', '出場ゾーンの枠より、相手側へ少し前に置きます。'],
        ['ディフェンス型', '出場ゾーンの枠より、少し後ろに置きます。'],
        ['合成魔獣', '出場ゾーンの枠にぴったり合わせて置きます。'],
        ['ミラクル', '発動表示枠より、少し左に表示します。'],
        ['ギミック', '設置枠より、少し右に置きます。'],
      ], note: 'どの種類も縦向きです。カードの向きではなく、モデルと数値で戦闘を判定します。' },
    ],
  },
  {
    id: 'combat', label: '戦闘', heading: '攻撃の結果を見極める', summary: '攻撃を受ける魔獣のモデルが、ダメージの判定を決めます。',
    panels: [
      { title: '攻撃とダメージ', icon: 'sword', rows: [
        ['攻撃する', '自分の魔獣を選び、相手の魔獣またはハートポイントを選択します。'],
        ['アタック型', '攻撃を受けると必ず消滅し、持ち主のハートポイントに相手の攻撃力分すべてのダメージが入ります。'],
        ['ディフェンス型', '守備力が相手の攻撃力以上なら場に残り、守備力もハートポイントも減りません。攻撃力が守備力を上回ると消滅し、超過分だけ持ち主のハートポイントが減ります。'],
        ['合成魔獣', 'アタック・ディフェンス型を兼ね、攻撃時は攻撃力、攻撃を受けたときは守備力で判定します。'],
      ], note: '通常の反撃はありません。消滅した魔獣はお墓ゾーンへ。モデル判定によるハートポイントへのダメージは、結界で軽減できません。' },
      { title: '能力と守り', icon: 'shield', rows: [
        ['守護', '守護を持つ相手の魔獣がいる間は、その魔獣から攻撃する必要があります。ミラクルの対象選択には影響しません。'],
        ['速攻', '召喚したターンから攻撃できます。'],
        ['吸収', '魔獣の攻撃で相手のハートポイントに実際に与えたダメージ分だけ、自分のハートポイントを回復します。'],
        ['結界', 'ハートポイントへのダメージを数値分だけ吸収。使った分だけ減り、残りは次のターンへ持ち越します。魔獣が攻撃を受けたときのモデル判定によるダメージには使えません。'],
      ] },
    ],
  },
  {
    id: 'fusion', label: '合成', heading: '素材を重ね、切り札を呼ぶ', summary: 'ミラクル「合成」で、特殊ゾーンの合成魔獣を召喚します。',
    panels: [
      { title: '合成召喚の手順', icon: 'fusion', rows: [
        ['発動', 'ミラクル「合成」を使います。消費するエーテルは3です。'],
        ['素材の選択', '自分の手持ち・出場ゾーン・お墓ゾーンの魔獣から、1枚以上の任意の枚数を選びます。どれか1つのゾーンだけでも、複数のゾーンを組み合わせても使えます。'],
        ['召喚', '選んだ素材はすべて異世界ゾーンへ送ります。特殊ゾーンから選んだ合成魔獣1体を、出場ゾーンへ召喚します。'],
      ] },
      { title: '強化と出場条件', icon: 'beast', rows: [
        ['素材の強化', '素材2枚目以降、1枚につき合成魔獣の攻撃力・守備力がそれぞれ＋100されます。'],
        ['空き枠', '素材にする出場中の魔獣を取り除いた後、出場ゾーンに空き枠が1つ必要です。'],
        ['次の合成', '合成魔獣も魔獣カードの一種なので、次の合成素材にできます。'],
      ], note: '素材1枚なら基本の数値。2枚なら攻撃力・守備力が各＋100、3枚なら各＋200になります。' },
    ],
  },
  {
    id: 'expansions', label: '新系統', heading: '共鳴を重ね、星界を拓く', summary: '第三弾は既存のデッキを支援。第四弾は独立した4系統を収録。',
    panels: [
      { title: '第三弾「継承の共鳴」', icon: 'shield', rows: [
        ['継承支援', '第一弾・第二弾の味方魔獣を強化し、減った守備力を回復。対象となる収録弾はカード本文で確認できます。'],
        ['再起と共鳴', 'お墓の低コスト魔獣を回収。第一弾と第二弾の魔獣を一緒に並べることで追加効果も生まれます。'],
        ['構築例', 'ショップに混合デッキ4種類を用意。必要枚数をすべて所持すると、新しい保存枠へ読み込めます。'],
      ] },
      { title: '第四弾「星界の創世」', icon: 'spark', rows: [
        ['星巡', '星巡の魔獣を異なるオリジンで展開。最大3種類までを参照し、強化や結界を増幅します。'],
        ['残響', 'お墓の残響ミラクルを最大3枚まで参照。今まさに使用しているカード自身は数えません。'],
        ['命誓', 'ハートポイント200を支払い、味方の強化や大きな効果へ。残り200以下では支払えません。'],
        ['封機', 'お墓の封機の魔獣1枚を異世界へ送って効果を増幅。異世界のカードは再利用できません。'],
      ], note: '系統の参照は第四弾の該当系統だけ。4系統それぞれに第四弾のみで組める構築例があります。' },
    ],
  },
  {
    id: 'systems', label: 'システム', heading: 'カードを集め、対戦を続ける', summary: 'スターター、パック、オンライン対戦、保存について。',
    panels: [
      { title: 'カードを集める', icon: 'treasure', rows: [
        ['スターター', '初回に4種類のうち1種類だけ無料で受け取ります。残りは各300秘宝で購入でき、必要なカードをすべて所持した場合に読み込めます。'],
        ['収録パック', '第一弾「六源の覚醒」・第二弾「王源の継承」・第三弾「継承の共鳴」・第四弾「星界の創世」。各弾は通常魔獣512枚・合成魔獣128枚・ミラクル256枚・ギミック256枚の1,152枚、合わせて全4,608枚です。'],
        ['パック', '100秘宝で12枚入りパックを開封できます。1枚はレア以上が確定。レガリアを含め、手に入れたカードはどのモードでも使えます。'],
      ] },
      { title: '対戦と保存', icon: 'book', rows: [
        ['オンライン', 'ルームコードで1対1の対戦、またはランクマッチで他のプレイヤーと対戦できます。ランクで60秒間相手が見つからなければBOT戦に切り替わり、相手にBOTと表示します。'],
        ['手番と中断', 'オンラインは1手番120秒、時間切れは敗北。一時停止はできません。CPU対戦は途中で中断・再開できます。'],
        ['保存と同期', '名前・アイコンの登録は、この端末のブラウザで最初の1回だけ。デッキ・所持カード・秘宝・CPU対戦はブラウザとクラウドへ保存し、連携した端末で同期できます。'],
      ] },
    ],
  },
]);

/** Render one chapter at a time; application state and navigation remain in app.js. */
export function rulebookView({ title, esc, icon, section = 'basics' } = {}) {
  const escape = typeof esc === 'function' ? esc : value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const glyph = name => typeof icon === 'function' ? icon(name) : '';
  const chapter = CHAPTERS.find(item => item.id === section) || CHAPTERS[0];
  const index = CHAPTERS.indexOf(chapter);
  const pageNumber = String(index + 1).padStart(2, '0');
  const heading = typeof title === 'function'
    ? title('HOW TO PLAY', 'ルールブック', '知りたいルールを選んで確認できます。')
    : '<div class="page-title"><div><div class="page-label">HOW TO PLAY</div><h1>ルールブック</h1><p>知りたいルールを選んで確認できます。</p></div></div>';

  return `<div class="rulebook" data-rulebook="${chapter.id}">
    ${heading}
    <nav class="rulebook-tabs" aria-label="ルールブックの章">${CHAPTERS.map((item, position) => `<button type="button" id="rulebook-tab-${item.id}" class="rulebook-tab${item.id === chapter.id ? ' active' : ''}" data-action="rulebook-section" data-section="${item.id}" aria-pressed="${item.id === chapter.id}" aria-controls="rulebook-sheet"><span class="rulebook-tab-number" aria-hidden="true">${String(position + 1).padStart(2, '0')}</span><span>${escape(item.label)}</span></button>`).join('')}</nav>
    <section id="rulebook-sheet" class="rulebook-sheet" aria-labelledby="rulebook-chapter-title">
      <header class="rulebook-sheet-heading"><h2 id="rulebook-chapter-title"><span>第${index + 1}章</span>${escape(chapter.heading)}</h2><p>${escape(chapter.summary)}</p></header>
      <div class="rulebook-spread">${chapter.panels.map(panel => `<article class="rulebook-panel"><h3><span aria-hidden="true">${glyph(panel.icon)}</span>${escape(panel.title)}</h3><dl class="rulebook-facts">${panel.rows.map(([label, text]) => `<div><dt>${escape(label)}</dt><dd>${escape(text)}</dd></div>`).join('')}</dl>${panel.note ? `<p class="rulebook-note">${escape(panel.note)}</p>` : ''}</article>`).join('')}</div>
    </section>
    <footer class="rulebook-footer"><p class="rulebook-reference"><span class="rulebook-page-number" aria-label="全${CHAPTERS.length}章の第${index + 1}章">${pageNumber}<small> / ${String(CHAPTERS.length).padStart(2,'0')}</small></span><a href="about.html">ゲームの紹介・よくある質問</a></p><div class="rulebook-actions"><button type="button" class="btn" data-nav="deck">デッキを選ぶ</button><button type="button" class="btn primary" data-action="tutorial-battle">${glyph('sword')}見習いCPUと対戦</button></div></footer>
  </div>`;
}
