<template>
  <div>
    <header class="border-b">
      <nav class="container mx-auto px-4 py-3">
        <ul class="flex items-center space-x-4">
          <li>
            <NuxtLink to="/" class="text-sm font-medium hover:underline">Home</NuxtLink>
          </li>
          <li>
            <NuxtLink to="/components" class="text-sm font-medium hover:underline">Components</NuxtLink>
          </li>
        </ul>
      </nav>
    </header>

    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
