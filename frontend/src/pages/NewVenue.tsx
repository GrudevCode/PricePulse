import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { venueApi } from '@/lib/api';
import { useVenueStore } from '@/store/venueStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Zap, AlertCircle, QrCode, ArrowRight } from 'lucide-react';

export default function NewVenue() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { venues, setVenues, setSelectedVenue } = useVenueStore();
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    lat: '',
    lng: '',
    capacity: '100',
    cuisineType: 'bar',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (key: string, value: string) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const createRes = await venueApi.create({
        name: formData.name,
        address: formData.address,
        lat: parseFloat(formData.lat) || 51.5074,
        lng: parseFloat(formData.lng) || -0.1278,
        capacity: parseInt(formData.capacity) || 100,
        cuisineType: formData.cuisineType,
      });
      const created = createRes.data?.data as { id: string } | undefined;
      const listRes = await venueApi.list();
      const all = (listRes.data?.data ?? []) as Array<{ id: string; name: string }>;
      setVenues(all as Parameters<typeof setVenues>[0]);
      const newId = created?.id ?? all.find((v) => v.name === formData.name)?.id ?? all[all.length - 1]?.id;
      if (newId) setSelectedVenue(newId);
      void qc.invalidateQueries({ queryKey: ['venues'] });
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to create venue';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto">
            <Zap className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">
            {venues.length > 0 ? 'Add another restaurant' : 'Add your venue'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {venues.length > 0
              ? 'Create an additional site — it will appear in your venue dropdown everywhere.'
              : 'Set up your venue and start getting AI pricing recommendations in minutes'}
          </p>
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Venue Details</CardTitle>
            <CardDescription>
              We need a few details to start collecting live signals for your location
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Venue Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. The Crown & Anchor"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => update('address', e.target.value)}
                  placeholder="123 High Street, London"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lat">Latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    value={formData.lat}
                    onChange={(e) => update('lat', e.target.value)}
                    placeholder="51.5074"
                  />
                  <p className="text-xs text-muted-foreground">Find on Google Maps</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lng">Longitude</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    value={formData.lng}
                    onChange={(e) => update('lng', e.target.value)}
                    placeholder="-0.1278"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => update('capacity', e.target.value)}
                    min="1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cuisineType">Type</Label>
                  <Select value={formData.cuisineType} onValueChange={(v) => update('cuisineType', v)}>
                    <SelectTrigger id="cuisineType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="pub">Pub</SelectItem>
                      <SelectItem value="nightclub">Nightclub</SelectItem>
                      <SelectItem value="restaurant">Restaurant</SelectItem>
                      <SelectItem value="cafe">Café</SelectItem>
                      <SelectItem value="cocktail_bar">Cocktail Bar</SelectItem>
                      <SelectItem value="sports_bar">Sports Bar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {/* QR Only highlight */}
              <div className="flex items-start gap-3 bg-primary/10 border border-primary/20 rounded-lg p-3">
                <QrCode className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-primary">QR Menu — No POS needed</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    After creating your venue, you can add menu items manually and get a hosted QR menu page instantly. No POS integration required to get started.
                  </p>
                </div>
              </div>

              <Button type="submit" className="w-full gap-2" size="lg" disabled={loading}>
                {loading ? 'Creating venue...' : 'Create Venue & Start Pricing'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
