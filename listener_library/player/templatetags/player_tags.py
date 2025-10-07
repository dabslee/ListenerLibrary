from django import template

register = template.Library()

@register.filter
def get_item(dictionary, key):
    return dictionary.get(key)

@register.filter
def mul(value, arg):
    return value * arg

@register.filter
def div(value, arg):
    if arg == 0:
        return 0
    return value / arg