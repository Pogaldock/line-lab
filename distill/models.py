# The candidate image models, one function each: pictures (N,224,224 ink 0..1) -> descriptions (N,D)
import numpy as np, torch
torch.set_grad_enabled(False)
IMN = ([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]); CLIPN = ([0.4815, 0.4578, 0.4082], [0.2686, 0.2613, 0.2758])
def views(x, tta):
    if not tta: return [x]
    return [torch.rot90(x, k, (2, 3)) for k in range(4)] + [torch.rot90(torch.flip(x, (3,)), k, (2, 3)) for k in range(4)]
def load(key):
    tta = key.endswith('+rot'); name = key.replace('+rot', '')
    if name.startswith('dinov2'):
        m = torch.hub.load('facebookresearch/dinov2', name).eval(); norm = IMN
        def f(x):
            o = m.forward_features(x); return torch.cat([o['x_norm_clstoken'], o['x_norm_patchtokens'].mean(1)], 1)
    else:
        import open_clip
        arch, pre = {'clip_ViT-B-32': ('ViT-B-32', 'laion2b_s34b_b79k'), 'clip_ViT-L-14': ('ViT-L-14', 'laion2b_s32b_b82k'), 'clip_ViT-H-14': ('ViT-H-14', 'laion2b_s32b_b79k')}[name]
        m = open_clip.create_model_and_transforms(arch, pretrained=pre)[0].eval(); norm = CLIPN; f = m.encode_image
    mean, std = torch.tensor(norm[0])[None, :, None, None], torch.tensor(norm[1])[None, :, None, None]
    def embed(ink, bs=32):
        out = []
        for i in range(0, len(ink), bs):
            x = torch.tensor(np.repeat(1 - ink[i:i + bs, None], 3, 1)); x = (x - mean) / std
            out.append(np.mean([f(v).numpy() for v in views(x, tta)], 0))
        return np.concatenate(out).astype(np.float32)
    return embed
