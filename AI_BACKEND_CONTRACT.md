# PropertyTwin AI backend contract

PropertyTwin calls a server-side HTTPS endpoint configured in **Profil → IA sécurisée**.
The iOS application never stores the image-provider API key.

## Request

`POST` with `Content-Type: application/json`:

```json
{
  "image_base64": "<JPEG or PNG>",
  "action": "Meubler",
  "style": "Japandi",
  "user_prompt": "Ajoute une bibliothèque murale",
  "instruction": "<PropertyTwin geometry-preservation instruction>",
  "preserve_geometry": true
}
```

Supported actions are `Meubler`, `Rénover`, `Changer le sol`,
`Changer les murs`, `Changer le style`, and `Vider la pièce`.

The backend must pass the source image and both prompts to an image-editing model.
It must not implement text-to-image generation without the source image.

## Response

Return either:

```json
{ "image_base64": "<generated image>" }
```

or:

```json
{ "image_url": "https://secure-temporary-url.example/result.png" }
```

The URL must use HTTPS. For errors, return a non-2xx status and:

```json
{ "message": "User-safe explanation" }
```

Generated images are validated by iOS, compressed, stored locally, and attached
to the selected real room as a `DesignVariant`.

