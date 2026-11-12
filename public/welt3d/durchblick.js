/*
 * welt3d – Durchblick
 * Was der Kamera zu nah kommt, löst sich in einem Punktmuster auf.
 * So verdecken Baumkronen zwischen Kamera und Figur nicht den Blick.
 */

export function durchblick(stoff, nah = 3, fern = 7) {
  stoff.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      {
        float ferne = length( vViewPosition );
        if ( ferne < ${fern.toFixed(1)} ) {
          float sichtbar = clamp( ( ferne - ${nah.toFixed(1)} ) / ${(fern - nah).toFixed(1)}, 0.0, 1.0 );
          float muster = fract( 52.9829189 * fract( dot( floor( gl_FragCoord.xy ), vec2( 0.06711056, 0.00583715 ) ) ) );
          if ( muster > sichtbar ) discard;
        }
      }`,
    );
  };
  stoff.customProgramCacheKey = () => `durchblick-${nah}-${fern}`;
  return stoff;
}
