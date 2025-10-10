from django import template
import math

register = template.Library()

@register.filter
def format_duration(seconds):
    if seconds is None or not isinstance(seconds, (int, float)):
        return "0:00"
    minutes = int(seconds // 60)
    seconds = int(seconds % 60)
    return f"{minutes}:{seconds:02d}"

@register.filter
def format_bytes(size_bytes):
    if not isinstance(size_bytes, (int, float)) or size_bytes < 0:
        return "0 B"
    if size_bytes == 0:
        return "0 B"
    size_name = ("B", "KB", "MB", "GB", "TB")
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 1)
    return f"{s} {size_name[i]}"