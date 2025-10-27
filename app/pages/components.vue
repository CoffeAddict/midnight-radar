<template>
  <main class="container mx-auto py-12">
    <div class="space-y-8">
      <h1 class="text-2xl font-bold">Shadcn-Vue Components</h1>

      <div class="space-y-4">
        <h2 class="text-xl font-semibold">Card</h2>
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card Description</CardDescription>
          </CardHeader>
          <CardContent>
            <p>This is the card content.</p>
          </CardContent>
          <CardFooter>
            <p>Card Footer</p>
          </CardFooter>
        </Card>
      </div>

      <div class="space-y-4">
        <h2 class="text-xl font-semibold">Input</h2>
        <Input placeholder="Enter some text" />
      </div>

      <div class="space-y-4">
        <h2 class="text-xl font-semibold">Button</h2>
        <div class="flex gap-4">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
      </div>

      <div class="space-y-4">
        <h2 class="text-xl font-semibold">Alert</h2>
        <Alert>
          <AlertTitle>Heads up!</AlertTitle>
          <AlertDescription>
            You can add components to your app using the cli.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
</script>
