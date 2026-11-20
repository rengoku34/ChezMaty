from django.contrib import admin

from .models import Event, Participation, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('nom', 'prenom', 'email', 'filiale', 'is_agent', 'created_at')
    list_filter = ('filiale', 'is_agent')
    search_fields = ('nom', 'prenom', 'email')
    exclude = ('password', 'last_login')


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('titre', 'debut', 'lieu', 'termine_at')


@admin.register(Participation)
class ParticipationAdmin(admin.ModelAdmin):
    list_display = ('event', 'user', 'confirme_at', 'scanne_at')
    readonly_fields = ('qr_token',)
