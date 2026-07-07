"""Verboo provider profile.

Verboo exposes an OpenAI-compatible router at ``code.verboo.ai/router/v1``
that fronts several upstream families (DeepSeek V4, GLM, Kimi, MiMo). The
router speaks the standard chat-completions wire format and serves a public
``/models`` catalog, so the default ``ProviderProfile`` behaviour is enough —
no custom hooks required.
"""

from __future__ import annotations

from providers import register_provider
from providers.base import ProviderProfile


verboo = ProviderProfile(
    name="verboo",
    aliases=("verboo-router",),
    env_vars=("VERBOO_API_KEY",),
    display_name="Verboo",
    description="Verboo — OpenAI-compatible router (DeepSeek V4, GLM, Kimi, MiMo)",
    signup_url="https://code.verboo.ai/",
    base_url="https://code.verboo.ai/router/v1",
    fallback_models=(
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "glm-5.2",
        "kimi-k2.7-code",
        "mimo-v2.5-pro",
    ),
    default_aux_model="deepseek-v4-flash",
)

register_provider(verboo)
