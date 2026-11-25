/** A very tight, reviewed portrait legitimately fills almost the whole crop.
 * The exception is tied to BOTH original bytes/crop and exact reviewed alpha
 * bytes. It cannot admit a different image or a new opaque prediction. */
export function maximumForegroundCoverage(source){
 const key='["mask-source-v1","assets/design-v2/cards/individual/beast-11.webp?art=20261124",1254,1254,[945,318,305,305]]';
 const original='18624556c99dcc14080be8f4dfa991946068cd0d8c72631a733feb5f99574f80';
 const pixels='d62d2d7322b7f074ff35a5f3a8fdced8918948ddd265176a8fd50a942249a169';
 return source?.sourceKey===key&&(source.sourceHash??source.sourceSha256)===original&&source.finalMaskPixelSha256===pixels ? .98 : .97;
}
