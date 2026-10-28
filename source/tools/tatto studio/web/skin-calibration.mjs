// A view transform only. Captured albedo and tattoo baking remain unmodified.
export const DEFAULT_CALIBRATION=Object.freeze([0,-.08,-.04]);
export const calibrationKey=()=>'previewRendererCalibration.v2';
export function normalizeCalibration(value){
 const input=Array.isArray(value)?value:DEFAULT_CALIBRATION;
 return [0,1,2].map(i=>typeof input[i]==='number'&&Number.isFinite(input[i])?Math.max(-.5,Math.min(.5,input[i])):DEFAULT_CALIBRATION[i]);
}
export const calibrationGLSL=`
uniform vec3 skinPreviewCalibration;
vec3 calibrateSkinPreview(vec3 color){
 if(all(lessThan(abs(skinPreviewCalibration),vec3(.000001))))return color;
 // White balance, saturation and a black-preserving brightness curve.
 float brightness=skinPreviewCalibration.x,temperature=skinPreviewCalibration.y;
 vec3 balanced=max(vec3(0.0),color*vec3(1.0+temperature*.22,1.0,1.0-temperature*.9));
 float luminance=dot(balanced,vec3(.2126,.7152,.0722));
 balanced=mix(vec3(luminance),balanced,1.0+skinPreviewCalibration.z);
 return pow(clamp(balanced,0.0,1.0),vec3(exp2(-brightness*2.0)));
}
`;
