// Transparent tattoo stack, optionally blending against the captured skin color.
export const blendModes={normal:0,multiply:1,darken:2,screen:3,overlay:4,softlight:5};
export const blendLabels={normal:'正常',multiply:'正片叠底',darken:'变暗',screen:'滤色',overlay:'叠加',softlight:'柔光'};
export const blendGLSL=`
vec3 tattooBlend(vec3 b,vec3 s,float mode){
 if(mode<.5)return s;
 if(mode<1.5)return b*s;
 if(mode<2.5)return min(b,s);
 if(mode<3.5)return b+s-b*s;
 if(mode<4.5)return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(.5),b));
 vec3 d=mix(((16.0*b-12.0)*b+4.0)*b,sqrt(max(b,vec3(0.0))),step(vec3(.25),b));
 return mix(b-(1.0-2.0*s)*b*(1.0-b),b+(2.0*s-1.0)*(d-b),step(vec3(.5),s));
}
vec4 tattooOver(vec4 b,vec4 s,float mode){
 float a=s.a+b.a*(1.0-s.a);if(a<.00001)return vec4(0.0);
 vec3 c=b.rgb*b.a*(1.0-s.a)+s.rgb*s.a*(1.0-b.a)+tattooBlend(b.rgb,s.rgb,mode)*b.a*s.a;
 return vec4(c/a,a);
}
vec4 tattooSkinOver(vec4 b,vec4 s,float mode,vec3 skin){
 // Store the blended ink only. Pixels outside stamps remain transparent.
 s.rgb=tattooBlend(mix(skin,b.rgb,b.a),s.rgb,mode);
 return tattooOver(b,s,0.0);
}
vec4 tattooRemoveWhite(vec4 t){
 float white=min(t.r,min(t.g,t.b));float ink=1.0-white;
 return vec4((t.rgb-vec3(white))/max(ink,.00001),t.a*ink);
}`;

export function blendRGB(b,s,mode='normal'){
 return b.map((v,i)=>{const t=s[i];switch(mode){
 case'multiply':return v*t;case'darken':return Math.min(v,t);case'screen':return v+t-v*t;
 case'overlay':return v<=.5?2*v*t:1-2*(1-v)*(1-t);
 case'softlight':{const d=v<=.25?((16*v-12)*v+4)*v:Math.sqrt(v);return t<=.5?v-(1-2*t)*v*(1-v):v+(2*t-1)*(d-v);}
 default:return t;}});
}
export function composite(b,s,mode='normal'){
 const a=s[3]+b[3]*(1-s[3]);if(a<.00001)return [0,0,0,0];const blended=blendRGB(b,s,mode);
 return [...b.slice(0,3).map((v,i)=>(v*b[3]*(1-s[3])+s[i]*s[3]*(1-b[3])+blended[i]*b[3]*s[3])/a),a];
}
export function compositeSkin(b,s,skin,mode='normal'){
 const visible=skin.map((v,i)=>v*(1-b[3])+b[i]*b[3]);
 return composite(b,[...blendRGB(visible,s,mode),s[3]]);
}
export function removeWhitePixel(t){const white=Math.min(...t.slice(0,3)),ink=1-white;return [...t.slice(0,3).map(v=>(v-white)/Math.max(ink,.00001)),t[3]*ink];}
