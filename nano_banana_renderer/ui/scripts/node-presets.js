// NanoBanana - Prompt Presets Data
var nodePresets = {
  render: [
    { id: 'screen-to-render', name: 'Screen to render', prompt: 'Create photorealistic image', negative: 'cartoon, illustration, sketch, low quality, blurry' },
    { id: 'image-to-sketch', name: 'Image to sketch', prompt: 'Convert to architectural sketch drawing', negative: 'photorealistic, photograph, color photo' },
    { id: 'top-view', name: 'Top view', prompt: 'Generate top-down orthographic view', negative: 'perspective distortion, vanishing point' },
    { id: 'side-view', name: 'Side view', prompt: 'Generate side elevation view', negative: 'top view, perspective, aerial' },
    { id: 'another-view', name: 'Another view', prompt: 'Generate an alternative camera angle of the same scene', negative: 'identical angle, same viewpoint' }
  ],
  modifier: [
    { id: 'enhance-realism', name: 'Enhance realism', prompt: 'Photorealistic architectural visualization. Enhance material realism, global illumination, reflections, and micro-details.', negative: 'cartoon, illustration, low quality' },
    { id: 'volumetric-rays', name: 'Volumetric rays', prompt: 'Add cinematic volumetric light rays. Sunlight scattering through space with realistic atmospheric particles.', negative: 'overexposure, dramatic color shift' },
    { id: 'make-brighter', name: 'Make brighter', prompt: 'Increase overall exposure and brightness. Preserve color balance and material fidelity.', negative: 'blown highlights, overexposure' },
    { id: 'closeup', name: 'Closeup', prompt: 'Create a close-up shot of the main subject. Shallow depth of field, realistic lens compression.', negative: 'wide angle, distant view' },
    { id: 'axonometry', name: 'Axonometry', prompt: 'Generate axonometric architectural visualization. Parallel projection. Clean edges.', negative: 'perspective distortion, vanishing point' },
    { id: 'winter', name: 'Winter', prompt: 'Change season to winter. Snow accumulation on horizontal surfaces. Cold daylight atmosphere.', negative: 'summer, green foliage, warm tones' },
    { id: 'autumn', name: 'Autumn', prompt: 'Change season to autumn. Warm golden and orange foliage. Soft warm-toned daylight.', negative: 'winter, snow, summer green' },
    { id: 'technical-drawings', name: 'Technical drawings', prompt: 'Architectural technical drawing style. Monochrome, clear linework, no artistic shading.', negative: 'photorealistic, color photo, artistic' },
    { id: 'logo', name: 'Logo', prompt: 'Transform into a clean logo-style illustration. Flat colors, simplified shapes.', negative: 'photorealistic, textures, gradients' },
    { id: 'day-to-night', name: 'Day to night', prompt: 'Convert daytime scene to nighttime. Artificial lighting from interior. Warm window glow.', negative: 'daylight, sunny, bright sky' },
    { id: 'night-to-day', name: 'Night to day', prompt: 'Convert nighttime scene to daytime. Natural daylight illumination.', negative: 'night, dark, artificial lighting only' },
    { id: 'add-people', name: 'Add people', prompt: 'Add realistic people naturally integrated into the scene. Correct scale and perspective.', negative: 'mannequins, cartoon people, oversized' },
    { id: 'add-blurred-people', name: 'Add blurred people', prompt: 'Add motion-blurred people for realism. Long exposure effect.', negative: 'sharp people, static poses' },
    { id: 'add-blurred-cars', name: 'Add blurred cars', prompt: 'Add motion-blurred cars on roads. Long exposure effect.', negative: 'static cars, parked' },
    { id: 'add-cars', name: 'Add cars', prompt: 'Add realistic parked cars matching scene context. Correct scale.', negative: 'floating cars, oversized' },
    { id: 'add-flowers', name: 'Add flowers', prompt: 'Add natural flowers subtly integrated into the scene.', negative: 'oversized flowers, artificial' },
    { id: 'add-grass', name: 'Add grass', prompt: 'Add natural grass and ground cover. Realistic lawn texture.', negative: 'artificial turf, oversaturated green' },
    { id: 'add-trees', name: 'Add trees', prompt: 'Add realistic trees appropriate to the climate and scene.', negative: 'cartoon trees, floating, oversized' }
  ],
  upscale: [
    { id: 'upscale', name: 'Upscale', prompt: 'Upscale', negative: '' }
  ],
  video: [
    { id: 'zoom-in', name: 'Zoom in', prompt: 'Zoom in', negative: '' },
    { id: 'move-forward', name: 'Move forward', prompt: 'Move forward', negative: '' },
    { id: 'orbit', name: 'Orbit', prompt: 'Orbit camera around subject', negative: '' },
    { id: 'pan-left', name: 'Pan left', prompt: 'Pan camera left', negative: '' }
  ]
};
